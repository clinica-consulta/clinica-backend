const Consulta = require("../models/Consulta");
const Contador = require("../models/Contador");
const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const Configuracao = require("../models/Configuracao");
const AppError = require("../utils/AppError");
const { dataISO, formatarDataBR } = require("../utils/datas");
const { notificar } = require("../services/notificacaoService");
const { verificarElegibilidade, horariosDisponiveis } = require("../services/agendaService");

const { STATUS, STATUS_ABERTOS } = Consulta;
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
    res.json(await verificarElegibilidade(paciente, req.query.especialidade));
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

    const elegivel = await verificarElegibilidade(pacienteId, profissional.especialidade);
    if (!elegivel.ok) throw new AppError(elegivel.motivo, 422);

    const livres = await horariosDisponiveis(profissional._id, data);
    if (!livres.includes(hora)) throw new AppError("Horário indisponível para este profissional", 409);

    const configuracao = await Configuracao.obter();
    const canal = req.usuario.tipo === "paciente" ? "Paciente" : "Recepção";
    const consulta = new Consulta({
        codigo: String(await Contador.proximo("consulta")),
        data,
        hora,
        paciente: pacienteId,
        profissional: profissional._id,
        especialidade: profissional.especialidade,
        status: configuracao.confirmacaoAutomatica ? "Confirmada" : "Agendada",
        respostaConfirmacao: configuracao.confirmacaoAutomatica ? "Confirmou" : "Sem resposta",
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
const statusPermitidos = (usuario) => {
    if (ehEquipe(usuario)) return STATUS;
    if (usuario.tipo === "paciente") return ["Confirmada", "Cancelada"];
    if (usuario.tipo === "profissional") return ["Confirmada", "Realizada", "Não compareceu"];
    return [];
};

const alterarStatus = async (req, res) => {
    const { status, observacao } = req.body ?? {};
    if (!STATUS.includes(status)) throw new AppError(`Status inválido. Use: ${STATUS.join(", ")}`);
    if (!statusPermitidos(req.usuario).includes(status)) {
        throw new AppError("Você não tem permissão para aplicar este status", 403);
    }

    const consulta = await buscar(req, req.params.id);
    if (!ehEquipe(req.usuario) && !STATUS_ABERTOS.includes(consulta.status)) {
        throw new AppError(`A consulta já está como "${consulta.status}"`, 409);
    }

    consulta.status = status;
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

    const livres = await horariosDisponiveis(consulta.profissional, data, consulta._id);
    if (!livres.includes(hora)) throw new AppError("Horário indisponível para este profissional", 409);

    const anterior = `${consulta.data} ${consulta.hora}`;
    consulta.set({ data, hora, status: "Remarcada", lembreteEnviadoEm: null, respostaConfirmacao: "Sem resposta" });
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
    consulta.lembreteEnviadoEm = dataISO();
    registrar(consulta, "Lembrete de confirmação enviado");
    await consulta.save();

    await notificar({
        titulo: "Lembrete de consulta",
        texto: `Confirme sua presença em ${formatarDataBR(consulta.data)} às ${consulta.hora}.`,
        publico: ["paciente"],
        paciente: consulta.paciente
    });

    res.json(consulta);
};

// Envia lembrete para todas as consultas futuras em aberto, sem resposta e ainda sem lembrete.
const enviarLembretesPendentes = async (_req, res) => {
    const pendentes = await Consulta.find({
        status: { $in: STATUS_ABERTOS },
        respostaConfirmacao: "Sem resposta",
        data: { $gte: dataISO() },
        lembreteEnviadoEm: null
    });

    for (const consulta of pendentes) {
        consulta.lembreteEnviadoEm = dataISO();
        registrar(consulta, "Lembrete de confirmação enviado");
        await consulta.save();
        await notificar({
            titulo: "Lembrete de consulta",
            texto: `Confirme sua presença em ${formatarDataBR(consulta.data)} às ${consulta.hora}.`,
            publico: ["paciente"],
            paciente: consulta.paciente
        });
    }

    if (pendentes.length) {
        await notificar({
            titulo: "Lembretes enviados",
            texto: `${pendentes.length} paciente(s) receberam o lembrete de confirmação.`,
            publico: ["recepcionista"]
        });
    }

    res.json({ enviados: pendentes.length, consultas: pendentes });
};

module.exports = {
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
