const FilaEspera = require("../models/FilaEspera");
const Consulta = require("../models/Consulta");
const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const AppError = require("../utils/AppError");
const { dataISO, horaAtual, formatarDataBR } = require("../utils/datas");
const { notificar } = require("./notificacaoService");
const { verificarElegibilidade, horariosDisponiveis } = require("./agendaService");
const { enviarEmailModelo, enviarEmailDaConsulta, dadosDaClinica, urlDoSite } = require("./emailConsultaService");

// Lista de espera por horário: até 5 pacientes esperando um horário já marcado.
const LIMITE_POR_HORARIO = 5;
// Quem recebe a vaga tem 2 horas para aceitar (ou até o horário começar, o que vier antes).
const PRAZO_OFERTA_MINUTOS = 120;
const ATIVOS = ["Aguardando", "Oferecido"];

const agora = () => `${dataISO()}T${horaAtual()}`;
const minutosAte = (data, hora) => (Date.parse(`${data}T${hora}:00Z`) - Date.parse(`${agora()}:00Z`)) / 60000;
const quandoDe = ({ data, hora }) => `${formatarDataBR(data)} às ${hora}`;
const horaDe = (instante) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone: process.env.TZ_CLINICA || "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(instante);

// Prioridade alta primeiro, depois a ordem de chegada.
const ordenar = (lista) =>
    [...lista].sort((a, b) => (a.prioridade === b.prioridade ? a.createdAt - b.createdAt : a.prioridade === "Alta" ? -1 : 1));

const listaDoHorario = async ({ profissional, data, hora }) =>
    ordenar(await FilaEspera.find({ profissional, data, hora, status: { $in: ATIVOS } }));

/** Posição de cada entrada na lista do próprio horário (1 = a próxima a receber a vaga). */
const posicaoNaFila = async (entrada) => {
    if (!entrada.profissional) return null;
    const lista = await listaDoHorario(entrada);
    return lista.findIndex((item) => String(item._id) === String(entrada._id)) + 1 || null;
};

/** Entra na lista de espera de um horário já marcado, com uma consulta alternativa já marcada. */
const entrarNaFila = async ({ pacienteId, profissionalId, data, hora, consultaAlternativaId = null, alternativa = null, exigirAlternativa = true, canal }) => {
    if (!pacienteId || !profissionalId || !data || !hora) throw new AppError("Informe o paciente, o médico, a data e o horário desejado");
    if (minutosAte(data, hora) <= 0) throw new AppError("Esse horário já passou", 409);

    const profissional = await Profissional.findById(profissionalId);
    if (!profissional) throw new AppError("Profissional não encontrado", 404);

    const ocupante = await Consulta.findOne({ profissional: profissionalId, data, hora, status: { $ne: "Cancelada" } });
    if (!ocupante) throw new AppError("Esse horário está livre: é só agendar direto", 409);
    if (String(ocupante.paciente) === String(pacienteId)) throw new AppError("Você já tem consulta nesse horário", 409);

    const elegivel = await verificarElegibilidade(pacienteId, profissional.especialidade, data);
    if (!elegivel.ok) throw new AppError(elegivel.motivo, 422);

    const lista = await listaDoHorario({ profissional: profissionalId, data, hora });
    if (lista.some((item) => String(item.paciente) === String(pacienteId))) throw new AppError("Você já está na lista de espera desse horário", 409);
    if (lista.length >= LIMITE_POR_HORARIO) {
        throw new AppError(`A lista de espera desse horário está completa (${LIMITE_POR_HORARIO} pacientes). Escolha outro horário.`, 409);
    }

    // Horário alternativo: uma consulta do paciente já marcada, ou uma nova marcada agora.
    let consultaAlternativa = null;
    if (consultaAlternativaId) {
        consultaAlternativa = await Consulta.findOne({ _id: consultaAlternativaId, paciente: pacienteId, status: { $in: Consulta.STATUS_ABERTOS } });
        if (!consultaAlternativa) throw new AppError("Consulta alternativa não encontrada", 404);
    } else if (alternativa?.profissional && alternativa?.data && alternativa?.hora) {
        // Carregado aqui para evitar dependência circular com o controlador de consultas.
        const { marcarConsulta } = require("../controllers/consultaController");
        consultaAlternativa = await marcarConsulta({ pacienteId, profissionalId: alternativa.profissional, data: alternativa.data, hora: alternativa.hora, canal });
    } else if (exigirAlternativa) {
        throw new AppError("Escolha também um horário livre como alternativa", 422);
    }

    const entrada = await FilaEspera.create({
        paciente: pacienteId,
        especialidade: profissional.especialidade,
        profissional: profissionalId,
        data,
        hora,
        consultaAlternativa: consultaAlternativa?._id ?? null,
        entradaEm: dataISO()
    });
    const paciente = await Paciente.findById(pacienteId);
    await notificar({
        titulo: "Entrada na lista de espera",
        texto: `${paciente?.nome ?? "Paciente"} entrou na lista de espera de ${quandoDe({ data, hora })} com ${profissional.nome} (${lista.length + 1}º da lista).`,
        publico: ["recepcionista"]
    });
    return { entrada, posicao: lista.length + 1, consultaAlternativa };
};

/** Avisa a pessoa que recebeu a vaga (portal e e-mail). */
const avisarOferta = async (entrada) => {
    const [profissional, paciente, clinica] = await Promise.all([Profissional.findById(entrada.profissional), Paciente.findById(entrada.paciente), dadosDaClinica()]);
    const ate = horaDe(entrada.oferta.expiraEm);
    const comQuem = profissional ? ` com ${profissional.nome}` : "";
    await notificar({
        titulo: "O horário que você esperava vagou",
        texto: `O horário de ${entrada.especialidade}${comQuem} em ${quandoDe(entrada)} vagou e está reservado para você até as ${ate}. Quer ficar com ele?`,
        publico: ["paciente"],
        paciente: entrada.paciente,
        acao: "fila",
        fila: entrada._id
    });
    if (!paciente?.email) return;
    const site = urlDoSite();
    await enviarEmailModelo({
        para: paciente.email,
        assunto: "O horário que você esperava vagou",
        titulo: "Seu horário da lista de espera vagou",
        nome: paciente.nome,
        mensagem: `Chegou a sua vez na lista de espera: o horário abaixo vagou e está reservado para você até as ${ate}. Se ficar com ele, sua consulta alternativa passa para esse horário.`,
        detalhes: [
            { rotulo: "Especialidade", valor: entrada.especialidade },
            ...(profissional ? [{ rotulo: "Profissional", valor: profissional.nome }] : []),
            { rotulo: "Data", valor: formatarDataBR(entrada.data) },
            { rotulo: "Horário", valor: entrada.hora },
            { rotulo: "Reservado até", valor: `${ate} de hoje` }
        ],
        botao: site ? { texto: "Ficar com este horário", link: `${site}/paciente` } : undefined,
        observacao: "Se não quiser, não precisa fazer nada: sua consulta alternativa continua marcada.",
        clinica
    });
};

/**
 * Quando um horário vaga, oferece ao primeiro da lista dele. Não faz nada se o horário
 * já passou, se ainda está ocupado, se já há uma oferta valendo ou se a lista está vazia.
 */
const oferecerVaga = async ({ profissional, data, hora }) => {
    if (!profissional || !data || !hora) return null;
    const restante = minutosAte(data, hora);
    if (restante <= 0) return null;
    if (await Consulta.exists({ profissional, data, hora, status: { $ne: "Cancelada" } })) return null;
    if (await FilaEspera.exists({ profissional, data, hora, status: "Oferecido", "oferta.expiraEm": { $gt: new Date() } })) return null;

    const proxima = (await listaDoHorario({ profissional, data, hora })).find((item) => item.status === "Aguardando");
    if (!proxima) return null;
    const expiraEm = new Date(Date.now() + Math.min(PRAZO_OFERTA_MINUTOS, restante) * 60000);
    const ofertada = await FilaEspera.findOneAndUpdate(
        { _id: proxima._id, status: "Aguardando" },
        { $set: { status: "Oferecido", oferta: { em: new Date(), expiraEm } } },
        { returnDocument: "after" }
    );
    if (ofertada) await avisarOferta(ofertada);
    return ofertada;
};

/** A pessoa fica com a vaga: a consulta alternativa passa para o horário desejado. */
const aceitarOferta = async (entrada) => {
    if (entrada.status !== "Oferecido") throw new AppError("Ainda não chegou a sua vez nesse horário", 409);
    if (!entrada.oferta?.expiraEm || entrada.oferta.expiraEm <= new Date()) throw new AppError("O prazo para ficar com esse horário terminou", 409);

    const alternativa = entrada.consultaAlternativa
        ? await Consulta.findOne({ _id: entrada.consultaAlternativa, paciente: entrada.paciente, status: { $in: Consulta.STATUS_ABERTOS } })
        : null;
    const livres = await horariosDisponiveis(entrada.profissional, entrada.data, alternativa?._id ?? null, entrada.paciente);
    if (!livres.includes(entrada.hora)) throw new AppError("Esse horário não está mais disponível", 409);

    let consulta;
    let anterior = null;
    if (alternativa) {
        anterior = { profissional: alternativa.profissional, data: alternativa.data, hora: alternativa.hora };
        const profissional = await Profissional.findById(entrada.profissional);
        alternativa.set({
            profissional: entrada.profissional,
            especialidade: profissional?.especialidade ?? entrada.especialidade,
            data: entrada.data,
            hora: entrada.hora,
            status: "Agendada",
            respostaConfirmacao: "Sem resposta",
            lembreteEnviadoEm: null,
            avisoDoDiaEm: null
        });
        alternativa.historico.push({ em: dataISO(), texto: `Trocada pelo horário da lista de espera (${quandoDe(entrada)}); antes: ${quandoDe(anterior)}` });
        consulta = await alternativa.save();
    } else {
        const { marcarConsulta } = require("../controllers/consultaController");
        consulta = await marcarConsulta({ pacienteId: entrada.paciente, profissionalId: entrada.profissional, data: entrada.data, hora: entrada.hora, canal: "Paciente" });
    }
    await entrada.deleteOne();

    const paciente = await Paciente.findById(entrada.paciente);
    await notificar({
        titulo: "Horário da lista de espera aceito",
        texto: `${paciente?.nome ?? "Paciente"} ficou com ${quandoDe(entrada)}${anterior ? ` e liberou ${quandoDe(anterior)}` : ""}.`,
        publico: ["recepcionista"]
    });
    if (alternativa) {
        await enviarEmailDaConsulta(consulta, {
            assunto: "Você ficou com o horário da lista de espera",
            mensagem: `Pronto! Sua consulta passou para o horário que você esperava. O horário alternativo (${quandoDe(anterior)}) foi liberado.`,
            botao: "Ver minha consulta",
            observacao: "A recepção vai pedir a confirmação da nova data."
        });
        // O horário alternativo que vagou pode ter a própria lista de espera.
        await oferecerVaga(anterior);
    }
    return consulta;
};

/** A pessoa não quer a vaga (ou sai da lista): passa para o próximo. */
const sairDaFila = async (entrada) => {
    const estavaComOferta = entrada.status === "Oferecido";
    await entrada.deleteOne();
    if (estavaComOferta) await oferecerVaga(entrada);
};

/**
 * Rotina de minuto em minuto: ofertas vencidas passam para o próximo, entradas de horários
 * que já passaram saem da lista, e horários livres com lista ganham oferta.
 */
const rotinaDaFila = async () => {
    const vencidas = await FilaEspera.find({ status: "Oferecido", "oferta.expiraEm": { $lte: new Date() } });
    for (const entrada of vencidas) {
        const removida = await FilaEspera.findOneAndDelete({ _id: entrada._id, status: "Oferecido" });
        if (!removida) continue;
        await notificar({
            titulo: "Prazo do horário da lista de espera terminou",
            texto: `O horário de ${quandoDe(entrada)} foi oferecido ao próximo da lista. Sua consulta alternativa continua marcada.`,
            publico: ["paciente"],
            paciente: entrada.paciente
        });
        await oferecerVaga(entrada);
    }

    const ativas = await FilaEspera.find({ profissional: { $ne: null }, status: { $in: ATIVOS } });
    const horarios = new Map();
    for (const entrada of ativas) {
        if (minutosAte(entrada.data, entrada.hora) <= 0) {
            await entrada.deleteOne();
            continue;
        }
        horarios.set(`${entrada.profissional}|${entrada.data}|${entrada.hora}`, entrada);
    }
    for (const entrada of horarios.values()) await oferecerVaga(entrada);
};

/** Quantas pessoas esperam cada horário (para o site mostrar "Ocupado · 2 na lista"). */
const contagemPorHorario = async ({ inicio, fim }) =>
    FilaEspera.aggregate([
        { $match: { profissional: { $ne: null }, status: { $in: ATIVOS }, data: { $gte: inicio, $lte: fim } } },
        { $group: { _id: { profissional: "$profissional", data: "$data", hora: "$hora" }, total: { $sum: 1 } } }
    ]);

module.exports = {
    LIMITE_POR_HORARIO,
    entrarNaFila,
    oferecerVaga,
    aceitarOferta,
    sairDaFila,
    rotinaDaFila,
    posicaoNaFila,
    contagemPorHorario
};
