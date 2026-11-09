const Consulta = require("../models/Consulta");
const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const Configuracao = require("../models/Configuracao");
const { dataISO, horaAtual, formatarDataBR } = require("../utils/datas");
const { notificar } = require("./notificacaoService");
const { avisarCobranca } = require("./pagamentoService");
const { enviarEmailDaConsulta } = require("./emailConsultaService");

const { STATUS_ABERTOS } = Consulta;

// Ciclo da consulta, contado a partir do horário marcado:
//   "antes"        -> confirmar, enviar lembrete, remarcar ou cancelar
//   "atendimento"  -> do horário até 1 hora depois: registrar se foi realizada ou se o paciente faltou
//   "encerrada"    -> passou 1 hora ou o resultado já foi registrado: nada mais muda, só a cobrança do particular
const JANELA_MINUTOS = 60;

const somarMinutos = (data, hora, minutos) => {
    const momento = new Date(`${data}T${hora}:00Z`);
    momento.setUTCMinutes(momento.getUTCMinutes() + minutos);
    return momento.toISOString().slice(0, 16);
};

// Datas e horas no fuso da clínica, no formato AAAA-MM-DDTHH:MM (comparáveis como texto).
const agora = () => `${dataISO()}T${horaAtual()}`;
// Um instante (Date) no formato AAAA-MM-DDTHH:MM do fuso da clínica.
const noFusoDaClinica = (instante) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: process.env.TZ_CLINICA || "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(instante)).replace(" ", "T");
const inicioDe = (consulta) => `${consulta.data}T${consulta.hora}`;
const fimDaJanela = (consulta) => somarMinutos(consulta.data, consulta.hora, JANELA_MINUTOS);

const momentoDaConsulta = (consulta) => {
    if (!STATUS_ABERTOS.includes(consulta.status)) return "encerrada";
    const atual = agora();
    if (atual < inicioDe(consulta)) return "antes";
    if (atual < fimDaJanela(consulta)) return "atendimento";
    return "encerrada";
};

const quandoDe = (consulta) => `${formatarDataBR(consulta.data)} às ${consulta.hora}`;

// Avisa o paciente que faltou (no portal e por e-mail) e convida a agendar outro dia.
const avisarAusencia = async (consulta) => {
    const profissional = await Profissional.findById(consulta.profissional);
    const comQuem = profissional ? ` com ${profissional.nome}` : "";
    await notificar({
        titulo: "Sentimos sua falta",
        texto: `Você não compareceu à consulta de ${consulta.especialidade}${comQuem} em ${quandoDe(consulta)}. Se quiser, agende um novo horário aqui no portal.`,
        publico: ["paciente"],
        paciente: consulta.paciente,
        consulta: consulta._id,
        acao: "remarcar"
    });

    await enviarEmailDaConsulta(consulta, {
        assunto: "Vamos agendar um novo horário?",
        mensagem: "Notamos que você não compareceu a esta consulta. Se quiser, é só escolher um novo dia e horário.",
        botao: "Agendar novo horário",
        caminho: "/paciente/agendar",
        observacao: "Se tiver qualquer dúvida, fale com a recepção da clínica."
    });
};

// Pede ao paciente (no portal e por e-mail) que confirme a presença. Só o paciente confirma.
const pedirConfirmacao = async (consulta) => {
    const profissional = await Profissional.findById(consulta.profissional);
    const comQuem = profissional ? ` com ${profissional.nome}` : "";
    await notificar({
        titulo: "Confirme sua consulta",
        texto: `Você tem consulta de ${consulta.especialidade}${comQuem} em ${quandoDe(consulta)}. Confirme sua presença aqui no portal.`,
        publico: ["paciente"],
        paciente: consulta.paciente,
        consulta: consulta._id
    });

    await enviarEmailDaConsulta(consulta, {
        assunto: "Confirme sua consulta",
        mensagem: "A clínica pede que você confirme sua presença nesta consulta. Ela só fica confirmada depois da sua resposta.",
        botao: "Confirmar presença",
        observacao: "Se não puder ir, cancele pelo portal para liberar o horário para outro paciente."
    });
};

// Libera a cobrança do paciente particular quando a consulta é realizada.
// Devolve true quando criou uma cobrança nova (quem chamou avisa o paciente depois de salvar).
const prepararCobranca = async (consulta) => {
    if (consulta.pagamento?.status) return false;
    const paciente = await Paciente.findById(consulta.paciente);
    if (paciente?.convenio !== "Particular") return false;
    const configuracao = await Configuracao.obter();
    consulta.pagamento = { status: "Pendente", valor: configuracao.valorConsulta };
    return true;
};

// Encerra as consultas em aberto cujo horário passou há mais de 1 hora:
// confirmada vira "Realizada" (com cobrança do particular); sem confirmação vira "Não compareceu".
// Seguro para rodar ao mesmo tempo em mais de um lugar: cada consulta só é encerrada uma vez.
const encerrarVencidas = async () => {
    const atual = agora();
    const candidatas = await Consulta.find({ status: { $in: STATUS_ABERTOS }, data: { $lte: dataISO() } });
    const encerradas = [];

    for (const candidata of candidatas) {
        if (fimDaJanela(candidata) > atual) continue;
        const novoStatus = candidata.status === "Confirmada" ? "Realizada" : "Não compareceu";
        const statusAnterior = candidata.status;

        candidata.status = novoStatus;
        const cobrar = novoStatus === "Realizada" && (await prepararCobranca(candidata));
        const atualizada = await Consulta.findOneAndUpdate(
            { _id: candidata._id, status: statusAnterior },
            {
                $set: { status: novoStatus, pagamento: candidata.pagamento },
                $push: { historico: { em: dataISO(), texto: `Encerrada automaticamente como "${novoStatus}" 1 hora após o horário` } }
            },
            { returnDocument: "after" }
        );
        if (!atualizada) continue;

        if (cobrar) await avisarCobranca(atualizada);
        if (novoStatus === "Não compareceu") await avisarAusencia(atualizada);
        encerradas.push(atualizada);
    }

    if (encerradas.length) {
        await notificar({
            titulo: "Consultas encerradas",
            texto: `${encerradas.length} consulta(s) encerrada(s) automaticamente 1 hora após o horário.`,
            publico: ["recepcionista"]
        });
    }
    return encerradas;
};

// Roda o encerramento de minuto em minuto enquanto a API estiver no ar.
// Avisa o paciente (portal e e-mail) quando faltam as horas da "Antecedência do lembrete".
// Uma vez por consulta; consulta marcada já dentro desse prazo não recebe (o e-mail de "Consulta marcada" acabou de chegar).
const enviarAvisosDoDia = async () => {
    const { antecedenciaLembreteHoras: horas = 24 } = await Configuracao.obter();
    const atual = agora();
    const ate = dataISO(Math.ceil(horas / 24) + 1);
    const candidatas = await Consulta.find({ status: { $in: STATUS_ABERTOS }, avisoDoDiaEm: null, data: { $gte: dataISO(), $lte: ate } });
    let enviados = 0;

    for (const candidata of candidatas) {
        const aPartirDe = somarMinutos(candidata.data, candidata.hora, -horas * 60);
        if (atual < aPartirDe || atual >= inicioDe(candidata)) continue;
        // Criada depois que o prazo do aviso já tinha começado: o e-mail de "Consulta marcada" basta.
        const criadaNoPrazo = noFusoDaClinica(candidata.createdAt) >= aPartirDe;

        const marcada = await Consulta.findOneAndUpdate({ _id: candidata._id, avisoDoDiaEm: null }, { $set: { avisoDoDiaEm: new Date() } }, { returnDocument: "after" });
        if (!marcada || criadaNoPrazo) continue;

        const hoje = marcada.data === dataISO();
        const quando = hoje ? `hoje às ${marcada.hora}` : `${formatarDataBR(marcada.data)} às ${marcada.hora}`;
        await notificar({
            titulo: hoje ? "Sua consulta é hoje" : "Sua consulta está chegando",
            texto: `Sua consulta de ${marcada.especialidade} é ${quando}. Chegue com 15 minutos de antecedência.`,
            publico: ["paciente"],
            paciente: marcada.paciente,
            consulta: marcada._id
        });
        await enviarEmailDaConsulta(marcada, {
            assunto: hoje ? "Sua consulta é hoje" : "Sua consulta está chegando",
            mensagem: `Lembrete: sua consulta é ${quando}. Chegue com 15 minutos de antecedência e leve um documento com foto${marcada.status === "Confirmada" ? "" : " e, se ainda não confirmou, confirme sua presença pelo portal"}.`,
            botao: "Ver minha consulta",
            observacao: "Se não puder ir, cancele pelo portal para liberar o horário para outro paciente."
        });
        enviados += 1;
    }
    return enviados;
};

const iniciarEncerramentoAutomatico = () => {
    const rodar = () =>
        encerrarVencidas()
            .then(() => enviarAvisosDoDia())
            // Carregado aqui para evitar dependência circular (a fila usa o controlador de consultas).
            .then(() => require("./filaEsperaService").rotinaDaFila())
            .catch((erro) => console.error("Falha nas rotinas automáticas das consultas:", erro.message));
    rodar();
    return setInterval(rodar, 60 * 1000);
};

module.exports = {
    JANELA_MINUTOS,
    momentoDaConsulta,
    encerrarVencidas,
    iniciarEncerramentoAutomatico,
    avisarAusencia,
    prepararCobranca,
    pedirConfirmacao,
    enviarAvisosDoDia
};
