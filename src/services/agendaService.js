const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const Especialidade = require("../models/Especialidade");
const Convenio = require("../models/Convenio");
const Bloqueio = require("../models/Bloqueio");
const Consulta = require("../models/Consulta");
const { diaDaSemana, minutos, intervaloDeHorarios } = require("../utils/datas");

// Regra de negócio: paciente ativo, especialidade ativa e coberta pelo convênio.
const verificarElegibilidade = async (pacienteId, especialidade) => {
    const paciente = await Paciente.findById(pacienteId);
    if (!paciente) return { ok: false, motivo: "Paciente sem cadastro na clínica." };
    if (paciente.status !== "Ativo") return { ok: false, motivo: "Cadastro do paciente está inativo." };

    const cadastro = await Especialidade.findOne({ nome: especialidade });
    if (!cadastro || !cadastro.ativo) return { ok: false, motivo: "Especialidade indisponível no momento." };

    const convenio = await Convenio.findOne({ nome: paciente.convenio });
    if (!convenio || !convenio.ativo || !convenio.coberturas.length) {
        return { ok: true, motivo: `Atendimento particular para ${especialidade}.` };
    }
    if (!convenio.coberturas.includes(especialidade)) {
        return { ok: false, motivo: `O convênio ${convenio.nome} não cobre ${especialidade}.` };
    }
    return { ok: true, motivo: `${convenio.nome} cobre ${especialidade}.` };
};

// Horários livres de 30 em 30 min: expediente do dia, menos consultas não canceladas e bloqueios.
const horariosDisponiveis = async (profissionalId, data, ignorarConsultaId = null) => {
    const profissional = await Profissional.findById(profissionalId);
    if (!profissional || !profissional.ativo) return [];

    const dia = profissional.disponibilidade.get(String(diaDaSemana(data)));
    if (!dia || !dia.ativo) return [];

    const filtroConsultas = { profissional: profissionalId, data, status: { $ne: "Cancelada" } };
    if (ignorarConsultaId) filtroConsultas._id = { $ne: ignorarConsultaId };

    const [ocupadas, bloqueios] = await Promise.all([
        Consulta.find(filtroConsultas).distinct("hora"),
        Bloqueio.find({ profissional: profissionalId, dataInicio: { $lte: data }, dataFim: { $gte: data } })
    ]);

    return intervaloDeHorarios(dia.inicio, dia.fim)
        .filter((hora) => !ocupadas.includes(hora))
        .filter((hora) => !bloqueios.some((b) => minutos(hora) >= minutos(b.horaInicio) && minutos(hora) < minutos(b.horaFim)));
};

module.exports = { verificarElegibilidade, horariosDisponiveis };
