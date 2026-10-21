const Notificacao = require("../models/Notificacao");

// Cria um aviso para os perfis informados. Falhas aqui não derrubam a ação principal.
const notificar = async ({ titulo, texto, publico, paciente = null, profissional = null, consulta = null, acao = "" }) => {
    try {
        return await Notificacao.create({ titulo, texto, publico, paciente, profissional, consulta, acao });
    } catch (erro) {
        console.error("Não foi possível registrar a notificação:", erro.message);
        return null;
    }
};

module.exports = { notificar };
