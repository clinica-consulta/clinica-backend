const mongoose = require("mongoose");
const Notificacao = require("../models/Notificacao");
const Paciente = require("../models/Paciente");
const Consulta = require("../models/Consulta");
const AppError = require("../utils/AppError");
const { TIPOS } = require("../models/Usuario");
const { notificar } = require("../services/notificacaoService");

const listar = async (req, res) => {
    const filtro = Notificacao.filtroPara(req.usuario);
    if (req.query.naoLidas === "true") filtro.lidaPor = { $ne: req.usuario._id };

    const notificacoes = await Notificacao.find(filtro).sort({ createdAt: -1 }).limit(50);
    res.json(notificacoes.map((item) => item.paraUsuario(req.usuario)));
};

// Aviso para um paciente só (ex.: atestado ou receita emitidos pelo médico).
const pacienteDestino = async (req, id) => {
    if (!mongoose.isValidObjectId(id) || !(await Paciente.exists({ _id: id }))) {
        throw new AppError("Paciente não encontrado", 404);
    }
    // O médico só envia documentos para pacientes que atendeu ou vai atender.
    if (req.usuario.tipo === "profissional" && !(await Consulta.exists({ paciente: id, profissional: req.usuario.profissional }))) {
        throw new AppError("Você só pode enviar documentos para os seus pacientes", 403);
    }
    return id;
};

const criar = async (req, res) => {
    const { titulo, texto, publico, paciente, acao } = req.body ?? {};
    const perfis = Array.isArray(publico) ? publico : [];
    if (!perfis.length || perfis.some((tipo) => !TIPOS.includes(tipo))) {
        throw new AppError(`Informe o público com os perfis: ${TIPOS.join(", ")}`);
    }
    const destino = paciente ? await pacienteDestino(req, paciente) : null;
    if (destino && (perfis.length !== 1 || perfis[0] !== "paciente")) {
        throw new AppError("Aviso para um paciente deve ter só o público paciente");
    }
    // Sem paciente escolhido, o médico só fala com a equipe (não com todos os pacientes).
    if (!destino && req.usuario.tipo === "profissional" && perfis.includes("paciente")) {
        throw new AppError("Escolha o paciente que vai receber o aviso");
    }
    const notificacao = await notificar({
        titulo,
        texto,
        publico: perfis,
        paciente: destino,
        acao: destino && acao === "documento" ? "documento" : ""
    });
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
