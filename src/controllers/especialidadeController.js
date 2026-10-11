const Especialidade = require("../models/Especialidade");
const Profissional = require("../models/Profissional");
const Convenio = require("../models/Convenio");
const AppError = require("../utils/AppError");

const buscar = async (id) => {
    const especialidade = await Especialidade.findById(id);
    if (!especialidade) throw new AppError("Especialidade não encontrada", 404);
    return especialidade;
};

const listar = async (_req, res) => {
    res.json(await Especialidade.find().sort({ nome: 1 }));
};

const criar = async (req, res) => {
    const especialidade = await Especialidade.create({ nome: req.body?.nome });
    res.status(201).json(especialidade);
};

const atualizar = async (req, res) => {
    const especialidade = await buscar(req.params.id);
    const nomeAnterior = especialidade.nome;
    if (req.body?.nome !== undefined) especialidade.nome = req.body.nome;
    if (req.body?.ativo !== undefined) especialidade.ativo = Boolean(req.body.ativo);
    await especialidade.save();

    // Renomear atualiza os profissionais e as coberturas de convênio que usam o nome antigo.
    if (especialidade.nome !== nomeAnterior) {
        await Profissional.updateMany({ especialidade: nomeAnterior }, { especialidade: especialidade.nome });
        await Convenio.updateMany({ coberturas: nomeAnterior }, { $set: { "coberturas.$": especialidade.nome } });
    }
    res.json(especialidade);
};

// Desativar preserva o histórico: a especialidade some das opções de agendamento.
const alternarStatus = async (req, res) => {
    const especialidade = await buscar(req.params.id);
    especialidade.ativo = !especialidade.ativo;
    await especialidade.save();
    res.json(especialidade);
};

module.exports = { listar, criar, atualizar, alternarStatus };
