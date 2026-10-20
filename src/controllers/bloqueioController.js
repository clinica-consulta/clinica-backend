const Bloqueio = require("../models/Bloqueio");
const Profissional = require("../models/Profissional");
const AppError = require("../utils/AppError");
const { escolherCampos } = require("../utils/texto");
const { formatarDataBR } = require("../utils/datas");
const { notificar } = require("../services/notificacaoService");

const listar = async (req, res) => {
    const filtro = {};
    if (req.query.profissional) filtro.profissional = req.query.profissional;
    if (req.query.data) {
        filtro.dataInicio = { $lte: req.query.data };
        filtro.dataFim = { $gte: req.query.data };
    }
    res.json(await Bloqueio.find(filtro).sort({ dataInicio: 1, horaInicio: 1 }));
};

const criar = async (req, res) => {
    const dados = escolherCampos(req.body, ["profissional", "dataInicio", "dataFim", "horaInicio", "horaFim", "motivo"]);
    if (!dados.profissional || !(await Profissional.exists({ _id: dados.profissional }))) {
        throw new AppError("Profissional não encontrado", 404);
    }
    const bloqueio = await Bloqueio.create({ ...dados, dataFim: dados.dataFim || dados.dataInicio });
    await notificar({
        titulo: "Agenda bloqueada",
        texto: `Período bloqueado em ${formatarDataBR(bloqueio.dataInicio)}, das ${bloqueio.horaInicio} às ${bloqueio.horaFim}.`,
        publico: ["recepcionista", "profissional", "administrador"],
        profissional: bloqueio.profissional
    });
    res.status(201).json(bloqueio);
};

const remover = async (req, res) => {
    const bloqueio = await Bloqueio.findByIdAndDelete(req.params.id);
    if (!bloqueio) throw new AppError("Bloqueio não encontrado", 404);
    res.json({ mensagem: "Bloqueio removido" });
};

module.exports = { listar, criar, remover };
