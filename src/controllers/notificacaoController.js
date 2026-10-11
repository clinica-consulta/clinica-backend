const Notificacao = require("../models/Notificacao");
const AppError = require("../utils/AppError");
const { TIPOS } = require("../models/Usuario");
const { notificar } = require("../services/notificacaoService");

const listar = async (req, res) => {
    const filtro = Notificacao.filtroPara(req.usuario);
    if (req.query.naoLidas === "true") filtro.lidaPor = { $ne: req.usuario._id };

    const notificacoes = await Notificacao.find(filtro).sort({ createdAt: -1 }).limit(50);
    res.json(notificacoes.map((item) => item.paraUsuario(req.usuario)));
};

const criar = async (req, res) => {
    const { titulo, texto, publico } = req.body ?? {};
    const perfis = Array.isArray(publico) ? publico : [];
    if (!perfis.length || perfis.some((tipo) => !TIPOS.includes(tipo))) {
        throw new AppError(`Informe o público com os perfis: ${TIPOS.join(", ")}`);
    }
    const notificacao = await notificar({ titulo, texto, publico: perfis });
    if (!notificacao) throw new AppError("Informe título e texto");
    res.status(201).json(notificacao.paraUsuario(req.usuario));
};

const marcarComoLida = async (req, res) => {
    const notificacao = await Notificacao.findOneAndUpdate(
        { _id: req.params.id, ...Notificacao.filtroPara(req.usuario) },
        { $addToSet: { lidaPor: req.usuario._id } },
        { new: true }
    );
    if (!notificacao) throw new AppError("Notificação não encontrada", 404);
    res.json(notificacao.paraUsuario(req.usuario));
};

const marcarTodasComoLidas = async (req, res) => {
    const resultado = await Notificacao.updateMany(Notificacao.filtroPara(req.usuario), {
        $addToSet: { lidaPor: req.usuario._id }
    });
    res.json({ atualizadas: resultado.modifiedCount });
};

module.exports = { listar, criar, marcarComoLida, marcarTodasComoLidas };
