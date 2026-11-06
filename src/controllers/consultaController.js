const Consulta = require("../models/Consulta");
const Contador = require("../models/Contador");
const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const AppError = require("../utils/AppError");
const { dataISO, formatarDataBR } = require("../utils/datas");
const { notificar } = require("../services/notificacaoService");
const { verificarElegibilidade, horariosDisponiveis } = require("../services/agendaService");
const stripe = require("../services/stripeService");
const { ErroGateway } = stripe;
const { avisarCobranca, lembrarPagamento, confirmarPagamento, abrirSessao, sincronizarComStripe } = require("../services/pagamentoService");
const { momentoDaConsulta, encerrarVencidas, avisarAusencia, prepararCobranca, pedirConfirmacao } = require("../services/cicloConsultaService");

const { STATUS, STATUS_ABERTOS } = Consulta;
// Status que registram o resultado do atendimento (só valem do horário até 1 hora depois).
const RESULTADOS = ["Realizada", "Não compareceu"];
// Intervalo mínimo entre dois lembretes de pagamento da mesma consulta.
const INTERVALO_LEMBRETE_PAGAMENTO = 24 * 60 * 60 * 1000;
const ehEquipe = (usuario) => ["recepcionista", "administrador"].includes(usuario.tipo);


const registrar = (consulta, texto) => {
    consulta.historico.push({ em: dataISO(), texto });
};

// Cada perfil só enxerga as próprias consultas; a equipe vê todas.
const filtroDeAcesso = (usuario) => {
    if (usuario.tipo === "paciente") return { paciente: usuario.paciente };
    if (usuario.tipo === "profissional") return { profissional: usuario.profissional };
    return {};
};

const buscar = async (req, id) => {
    const consulta = await Consulta.findOne({ _id: id, ...filtroDeAcesso(req.usuario) });
    if (!consulta) throw new AppError("Consulta não encontrada", 404);
    return consulta;
};

const listar = async (req, res) => {
    const filtro = { ...filtroDeAcesso(req.usuario) };
    const { data, dataInicio, dataFim, profissional, paciente, status, especialidade } = req.query;

    if (data) filtro.data = data;
    if (dataInicio || dataFim) {
        filtro.data = { ...(dataInicio && { $gte: dataInicio }), ...(dataFim && { $lte: dataFim }) };
    }
    if (profissional && !filtro.profissional) filtro.profissional = profissional;
    if (paciente && !filtro.paciente) filtro.paciente = paciente;
    if (status) filtro.status = status;
    if (especialidade) filtro.especialidade = especialidade;

    // Garante que a lista já venha com as consultas vencidas encerradas.
    await encerrarVencidas();
    res.json(await Consulta.find(filtro).sort({ data: 1, hora: 1 }));
};

const obter = async (req, res) => {
    res.json(await buscar(req, req.params.id));
};

// GET /consultas/horarios?profissional=&data=&ignorar=
const horarios = async (req, res) => {
    const { profissional, data, ignorar } = req.query;
    if (!profissional || !data) throw new AppError("Informe profissional e data");
    res.json({ data, horarios: await horariosDisponiveis(profissional, data, ignorar) });
};

// GET /consultas/elegibilidade?paciente=&especialidade=
const elegibilidade = async (req, res) => {
    const paciente = req.usuario.tipo === "paciente" ? req.usuario.paciente : req.query.paciente;
    if (!paciente || !req.query.especialidade) throw new AppError("Informe paciente e especialidade");
    res.json(await verificarElegibilidade(paciente, req.query.especialidade, req.query.data || dataISO()));
};

const criar = async (req, res) => {
    const { profissional: profissionalId, data, hora, observacoes } = req.body ?? {};
    const pacienteId = req.usuario.tipo === "paciente" ? req.usuario.paciente : req.body?.paciente;
    if (!pacienteId || !profissionalId || !data || !hora) {
        throw new AppError("Informe paciente, profissional, data e horário");
    }
    if (data < dataISO()) throw new AppError("Não é possível agendar em uma data que já passou");

    const profissional = await Profissional.findById(profissionalId);
    if (!profissional) throw new AppError("Profissional não encontrado", 404);

    const elegivel = await verificarElegibilidade(pacienteId, profissional.especialidade, data);
    if (!elegivel.ok) throw new AppError(elegivel.motivo, 422);

    const livres = await horariosDisponiveis(profissional._id, data);
    if (!livres.includes(hora)) throw new AppError("Horário indisponível para este profissional", 409);

    const canal = req.usuario.tipo === "paciente" ? "Paciente" : "Recepção";
    const consulta = new Consulta({
        codigo: String(await Contador.proximo("consulta")),
        data,
        hora,
        paciente: pacienteId,
        profissional: profissional._id,
        especialidade: profissional.especialidade,
        // A consulta só fica confirmada quando o próprio paciente confirma.
        status: "Agendada",
        respostaConfirmacao: "Sem resposta",
        observacoes: observacoes ?? "",
        canal
    });
    registrar(consulta, `Consulta criada (${canal.toLowerCase()})`);
    await consulta.save();

    const paciente = await Paciente.findById(pacienteId);
    await notificar({
        titulo: "Informações da consulta",
        texto: `${paciente?.nome ?? "Paciente"} · ${profissional.nome} · ${formatarDataBR(data)} às ${hora}.`,
        publico: ["recepcionista", "profissional", "paciente"],
        paciente: pacienteId,
        profissional: profissional._id
    });

    res.status(201).json(consulta);
};

// Quem pode levar a consulta para cada status.
// Só o paciente confirma a presença; a recepção pede a confirmação e registra o resultado.
const statusPermitidos = (usuario) => {
    if (ehEquipe(usuario)) return [...RESULTADOS, "Cancelada"];
    if (usuario.tipo === "paciente") return ["Confirmada", "Cancelada"];
    if (usuario.tipo === "profissional") return RESULTADOS;
    return [];
};

const alterarStatus = async (req, res) => {
    const { status, observacao } = req.body ?? {};
    if (!STATUS.includes(status)) throw new AppError(`Status inválido. Use: ${STATUS.join(", ")}`);
    if (!statusPermitidos(req.usuario).includes(status)) {
        throw new AppError("Você não tem permissão para aplicar este status", 403);
    }

    const consulta = await buscar(req, req.params.id);
    if (consulta.status === status) throw new AppError(`A consulta já está como "${consulta.status}"`, 409);
    if (consulta.status === "Cancelada") throw new AppError("A consulta foi cancelada e não pode mais ser alterada", 409);

    const resultado = RESULTADOS.includes(status);
    const momento = momentoDaConsulta(consulta);
    // A recepção registra (ou corrige) o resultado a qualquer momento: troca entre "Realizada" e "Não compareceu".
    const correcao = ehEquipe(req.usuario) && resultado && RESULTADOS.includes(consulta.status);
    if (!STATUS_ABERTOS.includes(consulta.status) && !correcao) {
        throw new AppError(`A consulta já foi encerrada como "${consulta.status}"`, 409);
    }
    if (!ehEquipe(req.usuario) || !resultado) {
        if (momento === "encerrada") throw new AppError("A consulta foi encerrada: já passou 1 hora do horário marcado", 409);
        if (resultado && momento === "antes") {
            throw new AppError("O resultado só pode ser registrado a partir do horário da consulta", 409);
        }
        if (!resultado && momento === "atendimento") {
            throw new AppError("O horário da consulta já começou: registre se ela foi realizada ou se o paciente não compareceu", 409);
        }
    }
    // Não some com um pagamento já feito.
    if (consulta.status === "Realizada" && status !== "Realizada" && consulta.pagamento?.status === "Pago") {
        throw new AppError("Esta consulta já foi paga e não pode deixar de ser realizada", 409);
    }

    if (consulta.status === "Realizada" && consulta.pagamento?.status === "Pendente") {
        // Deixou de ser realizada: a cobrança pendente é cancelada.
        consulta.pagamento = { status: null, valor: 0 };
        registrar(consulta, "Cobrança cancelada: a consulta deixou de constar como realizada");
    }
    consulta.status = status;
    // Só paciente particular paga na clínica; convênio não recebe cobrança.
    const cobrar = status === "Realizada" && (await prepararCobranca(consulta));
    if (status === "Confirmada") consulta.respostaConfirmacao = "Confirmou";
    if (status === "Cancelada") consulta.respostaConfirmacao = "Cancelou";
    registrar(consulta, observacao || `Status alterado para ${status}`);
    await consulta.save();

    const quando = `${formatarDataBR(consulta.data)} às ${consulta.hora}`;
    if (status === "Confirmada") {
        const profissional = await Profissional.findById(consulta.profissional);
        await notificar({
            titulo: "Consulta confirmada",
            texto: `${consulta.especialidade}${profissional ? ` com ${profissional.nome}` : ""} · ${quando}.`,
            publico: ["paciente", "recepcionista", "profissional"],
            paciente: consulta.paciente,
            profissional: consulta.profissional
        });
    }
    if (cobrar) {
        // Libera a cobrança e avisa o paciente no portal e por e-mail.
        await avisarCobranca(consulta);
    }
    if (status === "Não compareceu") {
        // Convida o paciente a agendar outro dia, no portal e por e-mail.
        await avisarAusencia(consulta);
    }
    if (status === "Cancelada") {
        await notificar({
            titulo: "Horário liberado",
            texto: `${quando} voltou a ficar disponível na agenda.`,
            publico: ["recepcionista", "administrador"]
        });
    }

    res.json(consulta);
};

const remarcar = async (req, res) => {
    const { data, hora } = req.body ?? {};
    if (!data || !hora) throw new AppError("Informe a nova data e o novo horário");
    if (data < dataISO()) throw new AppError("Não é possível remarcar para uma data que já passou");

    const consulta = await buscar(req, req.params.id);
    if (!STATUS_ABERTOS.includes(consulta.status)) {
        throw new AppError(`Não é possível remarcar uma consulta "${consulta.status}"`, 409);
    }
    if (momentoDaConsulta(consulta) !== "antes") {
        throw new AppError("Só é possível remarcar antes do horário da consulta", 409);
    }
    const elegivel = await verificarElegibilidade(consulta.paciente, consulta.especialidade, data);
    if (!elegivel.ok) throw new AppError(elegivel.motivo, 422);

    const livres = await horariosDisponiveis(consulta.profissional, data, consulta._id);
    if (!livres.includes(hora)) throw new AppError("Horário indisponível para este profissional", 409);

    const anterior = `${consulta.data} ${consulta.hora}`;
    // O lembrete não é zerado: cada consulta recebe no máximo um.
    consulta.set({ data, hora, status: "Remarcada", respostaConfirmacao: "Sem resposta" });
    registrar(consulta, `Remarcada de ${anterior} para ${data} ${hora}`);
    await consulta.save();

    const paciente = await Paciente.findById(consulta.paciente);
    await notificar({
        titulo: "Consulta remarcada",
        texto: `${paciente?.nome ?? "Paciente"} foi movido para ${formatarDataBR(data)} às ${hora}.`,
        publico: ["recepcionista", "profissional", "paciente"],
        paciente: consulta.paciente,
        profissional: consulta.profissional
    });

    res.json(consulta);
};

const enviarLembrete = async (req, res) => {
    const consulta = await buscar(req, req.params.id);
    if (consulta.lembreteEnviadoEm) {
        throw new AppError("O lembrete desta consulta já foi enviado. Só é permitido um lembrete por consulta.", 409);
    }
    if (consulta.status === "Confirmada") throw new AppError("A consulta já está confirmada", 409);
    if (momentoDaConsulta(consulta) !== "antes") {
        throw new AppError("O lembrete de confirmação só pode ser enviado antes do horário da consulta", 409);
    }
    consulta.lembreteEnviadoEm = dataISO();
    registrar(consulta, "Pedido de confirmação enviado ao paciente");
    await consulta.save();
    await pedirConfirmacao(consulta);

    res.json(consulta);
};

// Envia lembrete para todas as consultas futuras em aberto, sem resposta e ainda sem lembrete.
const enviarLembretesPendentes = async (_req, res) => {
    const candidatas = await Consulta.find({
        status: { $in: ["Agendada", "Remarcada"] },
        respostaConfirmacao: "Sem resposta",
        data: { $gte: dataISO() },
        lembreteEnviadoEm: null
    });
    // Só as que ainda não chegaram ao horário marcado.
    const pendentes = candidatas.filter((consulta) => momentoDaConsulta(consulta) === "antes");

    for (const consulta of pendentes) {
        consulta.lembreteEnviadoEm = dataISO();
        registrar(consulta, "Pedido de confirmação enviado ao paciente");
        await consulta.save();
        await pedirConfirmacao(consulta);
    }

    if (pendentes.length) {
        await notificar({
            titulo: "Pedidos de confirmação enviados",
            texto: `${pendentes.length} paciente(s) receberam o pedido de confirmação.`,
            publico: ["recepcionista"]
        });
    }

    res.json({ enviados: pendentes.length, consultas: pendentes });
};

const METODOS = ["Pix", "Cartão de crédito", "Cartão de débito", "Dinheiro"];

const exigirCobrancaPendente = (consulta) => {
    if (consulta.pagamento?.status === "Pago") throw new AppError("Esta consulta já está paga", 409);
    if (consulta.pagamento?.status !== "Pendente") {
        throw new AppError("Não há pagamento liberado para esta consulta. Ele é liberado para pacientes particulares depois que a consulta é realizada.", 409);
    }
};

// Registro manual do pagamento. A recepção usa para pagamentos feitos no balcão.
// Sem o Stripe configurado, o paciente também usa (pagamento simulado, para demonstração).
const pagar = async (req, res) => {
    const { metodo } = req.body ?? {};
    if (!METODOS.includes(metodo)) throw new AppError(`Escolha a forma de pagamento: ${METODOS.join(", ")}`);
    if (req.usuario.tipo === "paciente" && stripe.configurado()) {
        throw new AppError("Use o pagamento on-line da consulta", 409);
    }

    const consulta = await buscar(req, req.params.id);
    exigirCobrancaPendente(consulta);

    await confirmarPagamento(consulta, {
        metodo,
        codigo: `PAG-${consulta.codigo}-${Date.now().toString(36).toUpperCase()}`,
        gateway: "Recepção"
    });
    res.json(consulta);
};

// Abre o pagamento do Stripe (Pix, cartão, boleto...) para ser exibido dentro do site.
const checkout = async (req, res) => {
    if (!stripe.configurado()) {
        throw new AppError("O pagamento on-line ainda não está configurado nesta clínica", 503);
    }
    const consulta = await buscar(req, req.params.id);
    exigirCobrancaPendente(consulta);

    let resultado;
    try {
        resultado = await abrirSessao(consulta);
    } catch (erro) {
        if (erro instanceof ErroGateway) throw new AppError(erro.message, 502);
        throw erro;
    }
    if (resultado.jaPago) throw new AppError("Esta consulta já está paga", 409);
    if (resultado.aguardando) {
        throw new AppError("Seu pagamento já foi enviado e está aguardando confirmação (Pix ou boleto). Assim que cair, você recebe um aviso.", 409);
    }
    res.json({ clientSecret: resultado.sessao.client_secret, chavePublica: stripe.chavePublica(), teste: stripe.modoTeste() });
};

// A recepção lembra o paciente particular de uma cobrança pendente (no máximo uma vez a cada 24 horas).
const lembrarPagamentoPendente = async (req, res) => {
    const consulta = await buscar(req, req.params.id);
    exigirCobrancaPendente(consulta);
    const ultimo = consulta.pagamento.lembreteEm ? new Date(consulta.pagamento.lembreteEm).getTime() : 0;
    const proximo = ultimo + INTERVALO_LEMBRETE_PAGAMENTO;
    if (Date.now() < proximo) {
        const quando = new Intl.DateTimeFormat("pt-BR", { timeZone: process.env.TZ_CLINICA || "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(proximo);
        throw new AppError(`O lembrete de pagamento já foi enviado. Envie de novo a partir de ${quando}.`, 409);
    }

    consulta.pagamento.lembreteEm = new Date();
    registrar(consulta, "Lembrete de pagamento enviado");
    await consulta.save();
    await lembrarPagamento(consulta);
    res.json(consulta);
};

// Confere no Stripe se o pagamento da consulta foi aprovado (usado ao terminar o pagamento no site).
const verificarPagamento = async (req, res) => {
    const consulta = await buscar(req, req.params.id);
    if (!consulta.pagamento?.status) throw new AppError("Esta consulta não tem cobrança", 409);
    try {
        await sincronizarComStripe(consulta);
    } catch (erro) {
        if (erro instanceof ErroGateway) throw new AppError(erro.message, 502);
        throw erro;
    }
    res.json(consulta);
};

module.exports = {
    pagar,
    lembrarPagamentoPendente,
    checkout,
    verificarPagamento,
    listar,
    obter,
    horarios,
    elegibilidade,
    criar,
    alterarStatus,
    remarcar,
    enviarLembrete,
    enviarLembretesPendentes
};
