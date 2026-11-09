const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const Configuracao = require("../models/Configuracao");
const { formatarDataBR, diaDaSemana } = require("../utils/datas");
const { enviarEmail } = require("./emailService");
const { montarEmail, urlDoSite } = require("./emailModeloService");

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Dados da clínica para o cabeçalho e o rodapé dos e-mails. */
const dadosDaClinica = async () => {
    const clinica = await Configuracao.obter();
    return { nome: clinica.nome, telefone: clinica.telefone, email: clinica.email };
};

/** Detalhes da consulta no formato do quadro do e-mail. */
const detalhesDaConsulta = async (consulta, clinica) => {
    const profissional = await Profissional.findById(consulta.profissional);
    return [
        { rotulo: "Código", valor: `#${consulta.codigo}` },
        { rotulo: "Especialidade", valor: consulta.especialidade },
        ...(profissional ? [{ rotulo: "Profissional", valor: profissional.nome }] : []),
        { rotulo: "Data", valor: `${formatarDataBR(consulta.data)} (${DIAS[diaDaSemana(consulta.data)]})` },
        { rotulo: "Horário", valor: consulta.hora },
        { rotulo: "Local", valor: `${clinica.nome} · presencial` }
    ];
};

/** Envia um e-mail no modelo da clínica. Sem e-mail configurado, não envia; falhas não derrubam a ação. */
const enviarEmailModelo = async ({ para, assunto, ...conteudo }) => {
    const { html, texto } = montarEmail(conteudo);
    try {
        return await enviarEmail({ para, assunto, texto, html });
    } catch (erro) {
        console.error(`Falha ao enviar e-mail (${assunto}):`, erro.message);
        return false;
    }
};

/**
 * E-mail para o paciente sobre uma consulta, com os detalhes dela e um botão para o portal.
 * @param {object} opcoes
 * @param {string} opcoes.assunto
 * @param {string} opcoes.mensagem
 * @param {string} [opcoes.titulo]      Título no topo (padrão: o assunto).
 * @param {string} [opcoes.botao]       Texto do botão (padrão: "Abrir o portal do paciente").
 * @param {string} [opcoes.caminho]     Página do site que o botão abre (padrão: /paciente).
 * @param {string} [opcoes.observacao]
 * @param {{rotulo: string, valor: string}[]} [opcoes.extras]  Linhas a mais no quadro de detalhes.
 */
const enviarEmailDaConsulta = async (consulta, { assunto, mensagem, titulo, botao = "Abrir o portal do paciente", caminho = "/paciente", observacao = "", extras = [] }) => {
    const paciente = await Paciente.findById(consulta.paciente);
    if (!paciente?.email) return false;
    const clinica = await dadosDaClinica();
    const detalhes = [...(await detalhesDaConsulta(consulta, clinica)), ...extras];
    const site = urlDoSite();
    return enviarEmailModelo({
        para: paciente.email,
        assunto: `${assunto} · consulta #${consulta.codigo}`,
        titulo: titulo ?? assunto,
        nome: paciente.nome,
        mensagem,
        detalhes,
        botao: site ? { texto: botao, link: `${site}${caminho}` } : undefined,
        observacao,
        clinica
    });
};

module.exports = { enviarEmailDaConsulta, enviarEmailModelo, dadosDaClinica, urlDoSite, DIAS };
