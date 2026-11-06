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
        chamada: "Agende um novo horário pelo portal do paciente:",
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
        chamada: "Confirme sua presença (ou cancele, se não puder ir) no portal do paciente:"
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
const iniciarEncerramentoAutomatico = () => {
    const rodar = () => encerrarVencidas().catch((erro) => console.error("Falha ao encerrar consultas:", erro.message));
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
    pedirConfirmacao
};
