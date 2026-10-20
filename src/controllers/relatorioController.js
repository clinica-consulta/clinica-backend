const Consulta = require("../models/Consulta");
const Profissional = require("../models/Profissional");
const Paciente = require("../models/Paciente");
const { dataISO, diaDaSemana, intervaloDeHorarios } = require("../utils/datas");

const contar = (lista, status) => lista.filter((item) => item.status === status).length;

// Indicadores do painel: presença, faltas, cancelamentos, movimento da semana e ocupação.
const resumo = async (_req, res) => {
    const hoje = dataISO();
    const [consultas, profissionais, pacientesAtivos] = await Promise.all([
        Consulta.find(),
        Profissional.find({ ativo: true }),
        Paciente.countDocuments({ status: "Ativo" })
    ]);

    const realizadas = contar(consultas, "Realizada");
    const faltas = contar(consultas, "Não compareceu");
    const proximos7Dias = Array.from({ length: 7 }, (_, indice) => dataISO(indice));

    const ocupacao = profissionais.map((profissional) => {
        const capacidade = proximos7Dias.reduce((total, data) => {
            const dia = profissional.disponibilidade.get(String(diaDaSemana(data)));
            return total + (dia?.ativo ? intervaloDeHorarios(dia.inicio, dia.fim).length : 0);
        }, 0);
        const agendadas = consultas.filter(
            (item) =>
                String(item.profissional) === String(profissional._id) &&
                proximos7Dias.includes(item.data) &&
                item.status !== "Cancelada"
        ).length;
        return {
            profissional: profissional.nome,
            especialidade: profissional.especialidade,
            agendadas,
            capacidade,
            ocupacao: capacidade ? Math.round((agendadas / capacidade) * 100) : 0
        };
    });

    res.json({
        total: consultas.length,
        hoje: consultas.filter((item) => item.data === hoje).length,
        realizadas,
        faltas,
        canceladas: contar(consultas, "Cancelada"),
        presenca: realizadas + faltas ? Math.round((realizadas / (realizadas + faltas)) * 100) : 0,
        pendentesConfirmacao: consultas.filter(
            (item) => item.data >= hoje && item.respostaConfirmacao === "Sem resposta" && ["Agendada", "Remarcada"].includes(item.status)
        ).length,
        pacientesAtivos,
        porDia: Array.from({ length: 7 }, (_, indice) => {
            const data = dataISO(indice - 6);
            return { data, total: consultas.filter((item) => item.data === data).length };
        }),
        ocupacao
    });
};

module.exports = { resumo };
