const Configuracao = require("../models/Configuracao");
const { escolherCampos } = require("../utils/texto");

const CAMPOS = ["nome", "cnpj", "telefone", "email", "antecedenciaLembreteHoras", "confirmacaoAutomatica", "valorConsulta"];

const obter = async (_req, res) => {
    res.json(await Configuracao.obter());
};

const atualizar = async (req, res) => {
    const configuracao = await Configuracao.obter();
    configuracao.set(escolherCampos(req.body, CAMPOS));
    await configuracao.save();
    res.json(configuracao);
};

module.exports = { obter, atualizar };
