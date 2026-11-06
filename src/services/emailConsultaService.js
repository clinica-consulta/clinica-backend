const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const Configuracao = require("../models/Configuracao");
const { formatarDataBR, diaDaSemana } = require("../utils/datas");
const { enviarEmail } = require("./emailService");

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const urlDoSite = () => (process.env.FRONTEND_URL || (process.env.CORS_ORIGIN || "").split(",")[0] || "").trim().replace(/\/+$/, "");

// E-mail para o paciente sobre uma consulta, sempre com os mesmos detalhes no mesmo formato:
// saudação, mensagem, detalhes da consulta, link para o portal e contato da clínica.
// Sem e-mail configurado (Brevo ou SMTP), não envia nada; falhas no envio não derrubam a ação principal.
const enviarEmailDaConsulta = async (consulta, { assunto, mensagem, chamada = "Acompanhe sua consulta no portal do paciente:", caminho = "/paciente", observacao = "" }) => {
    const paciente = await Paciente.findById(consulta.paciente);
    if (!paciente?.email) return false;
    const [profissional, clinica] = await Promise.all([Profissional.findById(consulta.profissional), Configuracao.obter()]);

    const link = urlDoSite() ? `${urlDoSite()}${caminho}` : "";
    const detalhes = [
        `• Código: #${consulta.codigo}`,
        `• Especialidade: ${consulta.especialidade}`,
        profissional ? `• Profissional: ${profissional.nome}` : "",
        `• Data: ${formatarDataBR(consulta.data)} (${DIAS[diaDaSemana(consulta.data)]})`,
        `• Horário: ${consulta.hora}`,
        `• Local: ${clinica.nome} (atendimento presencial)`
    ].filter(Boolean);
    const contato = [clinica.telefone, clinica.email].filter(Boolean).join(" · ");

    const texto =
        `Olá, ${paciente.nome}!\n\n` +
        `${mensagem}\n\n` +
        `Detalhes da consulta\n${detalhes.join("\n")}\n\n` +
        (link ? `${chamada}\n${link}\n\n` : "") +
        (observacao ? `${observacao}\n\n` : "") +
        `Equipe ${clinica.nome}` +
        (contato ? `\n${contato}` : "");

    try {
        return await enviarEmail({ para: paciente.email, assunto: `${assunto} · consulta #${consulta.codigo}`, texto });
    } catch (erro) {
        console.error(`Falha ao enviar e-mail (${assunto}):`, erro.message);
        return false;
    }
};

module.exports = { enviarEmailDaConsulta, urlDoSite };
