const FUSO = process.env.TZ_CLINICA || "America/Sao_Paulo";

// Data no formato AAAA-MM-DD no fuso da clínica, com deslocamento em dias.
const dataISO = (deslocamentoDias = 0) => {
    const data = new Date(Date.now() + deslocamentoDias * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(data);
};

const diaDaSemana = (dataIso) => new Date(`${dataIso}T12:00:00Z`).getUTCDay();

const minutos = (hora) => {
    const [h = 0, m = 0] = String(hora).split(":").map(Number);
    return h * 60 + m;
};

const formatarHora = (totalMinutos) =>
    `${String(Math.floor(totalMinutos / 60)).padStart(2, "0")}:${String(totalMinutos % 60).padStart(2, "0")}`;

// Horários de 30 em 30 minutos entre início (incluso) e fim (excluso).
const intervaloDeHorarios = (inicio, fim) => {
    const horarios = [];
    for (let atual = minutos(inicio); atual < minutos(fim); atual += 30) {
        horarios.push(formatarHora(atual));
    }
    return horarios;
};

const formatarDataBR = (dataIso) => {
    const [ano, mes, dia] = dataIso.split("-");
    return `${dia}/${mes}/${ano}`;
};

module.exports = { dataISO, diaDaSemana, minutos, intervaloDeHorarios, formatarDataBR };
