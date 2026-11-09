const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const Especialidade = require("../models/Especialidade");
const Convenio = require("../models/Convenio");
const Bloqueio = require("../models/Bloqueio");
const Consulta = require("../models/Consulta");
const FilaEspera = require("../models/FilaEspera");
const { dataISO, horaAtual, diaDaSemana, minutos, intervaloDeHorarios, formatarDataBR } = require("../utils/datas");

// Regra de negócio: paciente ativo, especialidade ativa, carteirinha válida e especialidade coberta pelo convênio.
// "data" é o dia da consulta: a carteirinha do convênio precisa estar válida nesse dia.
const verificarElegibilidade = async (pacienteId, especialidade, data = dataISO()) => {
    const paciente = await Paciente.findById(pacienteId);
    if (!paciente) return { ok: false, motivo: "Paciente sem cadastro na clínica." };
    if (paciente.status !== "Ativo") return { ok: false, motivo: "Cadastro do paciente está inativo." };

    const cadastro = await Especialidade.findOne({ nome: especialidade });
    if (!cadastro || !cadastro.ativo) return { ok: false, motivo: "Especialidade indisponível no momento." };

    if (!paciente.convenio || paciente.convenio === "Particular") {
        return { ok: true, motivo: `Atendimento particular para ${especialidade}.` };
    }
    const convenio = await Convenio.findOne({ nome: paciente.convenio });
    if (!convenio || !convenio.ativo) {
        return { ok: false, motivo: `O convênio ${paciente.convenio} não é mais aceito pela clínica. Atualize o cadastro do paciente.` };
    }
    const { numero, validade } = paciente.carteirinha ?? {};
    if (!numero || !validade) {
        return { ok: false, motivo: `Cadastre a carteirinha do ${convenio.nome} (número, validade e plano) para agendar.` };
    }
    if (validade < data) {
        return { ok: false, motivo: `A carteirinha do ${convenio.nome} venceu em ${formatarDataBR(validade)}. Atualize a validade no cadastro.` };
    }
    if (convenio.coberturas.length && !convenio.coberturas.includes(especialidade)) {
        return { ok: false, motivo: `O convênio ${convenio.nome} não cobre ${especialidade}.` };
    }
    return { ok: true, motivo: `${convenio.nome} cobre ${especialidade}.` };
};

// Horários livres de 30 em 30 min: expediente do dia, menos consultas não canceladas e bloqueios.
// Horário oferecido a alguém da lista de espera fica reservado para essa pessoa enquanto a oferta vale.
// `pacienteId`: quem está agendando (o horário oferecido a ele continua livre para ele).
const horariosDisponiveis = async (profissionalId, data, ignorarConsultaId = null, pacienteId = null) => {
    // Dia que já passou não tem horário; hoje, só a partir da hora atual.
    const hoje = dataISO();
    if (data < hoje) return [];
    const agora = data === hoje ? minutos(horaAtual()) : -1;

    const profissional = await Profissional.findById(profissionalId);
    if (!profissional || !profissional.ativo) return [];

    const dia = profissional.disponibilidade.get(String(diaDaSemana(data)));
    if (!dia || !dia.ativo) return [];

    const filtroConsultas = { profissional: profissionalId, data, status: { $ne: "Cancelada" } };
    if (ignorarConsultaId) filtroConsultas._id = { $ne: ignorarConsultaId };

    const [ocupadas, bloqueios, reservadas] = await Promise.all([
        Consulta.find(filtroConsultas).distinct("hora"),
        Bloqueio.find({ profissional: profissionalId, dataInicio: { $lte: data }, dataFim: { $gte: data } }),
        FilaEspera.find({ profissional: profissionalId, data, status: "Oferecido", "oferta.expiraEm": { $gt: new Date() }, ...(pacienteId && { paciente: { $ne: pacienteId } }) }).distinct("hora")
    ]);

    return intervaloDeHorarios(dia.inicio, dia.fim)
        .filter((hora) => minutos(hora) > agora)
        .filter((hora) => !ocupadas.includes(hora) && !reservadas.includes(hora))
        .filter((hora) => !bloqueios.some((b) => minutos(hora) >= minutos(b.horaInicio) && minutos(hora) < minutos(b.horaFim)));
};

module.exports = { verificarElegibilidade, horariosDisponiveis };
