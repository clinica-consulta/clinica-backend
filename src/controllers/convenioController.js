const Convenio = require("../models/Convenio");
const AppError = require("../utils/AppError");
const { escolherCampos } = require("../utils/texto");

const CAMPOS = ["nome", "coberturas", "ativo"];

const buscar = async (id) => {
    const convenio = await Convenio.findById(id);
    if (!convenio) throw new AppError("Convênio não encontrado", 404);
    return convenio;
};

const listar = async (_req, res) => {
    res.json(await Convenio.find().sort({ nome: 1 }));
};

const criar = async (req, res) => {
    res.status(201).json(await Convenio.create(escolherCampos(req.body, CAMPOS)));
};

const atualizar = async (req, res) => {
    const convenio = await buscar(req.params.id);
    convenio.set(escolherCampos(req.body, CAMPOS));
    await convenio.save();
    res.json(convenio);
};

const alternarStatus = async (req, res) => {
    const convenio = await buscar(req.params.id);
    convenio.ativo = !convenio.ativo;
    await convenio.save();
    res.json(convenio);
};

module.exports = { listar, criar, atualizar, alternarStatus };
