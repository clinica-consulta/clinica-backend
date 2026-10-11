const Usuario = require("../models/Usuario");
const AppError = require("../utils/AppError");
const { escolherCampos } = require("../utils/texto");

// Esta rota cuida da equipe interna. Pacientes e profissionais têm rotas próprias.
const TIPOS_EQUIPE = ["recepcionista", "administrador"];

const buscar = async (id) => {
    const usuario = await Usuario.findOne({ _id: id, tipo: { $in: TIPOS_EQUIPE } });
    if (!usuario) throw new AppError("Usuário não encontrado", 404);
    return usuario;
};

const validarTipo = (tipo) => {
    if (tipo !== undefined && !TIPOS_EQUIPE.includes(tipo)) {
        throw new AppError("Perfil inválido. Use recepcionista ou administrador");
    }
};

const listar = async (_req, res) => {
    res.json(await Usuario.find({ tipo: { $in: TIPOS_EQUIPE } }).sort({ nome: 1 }));
};

const criar = async (req, res) => {
    const dados = escolherCampos(req.body, ["nome", "email", "telefone", "tipo", "status"]);
    validarTipo(dados.tipo);
    const usuario = await Usuario.create({
        ...dados,
        tipo: dados.tipo ?? "recepcionista",
        senha: req.body?.senha || process.env.SENHA_PADRAO || "123456"
    });
    res.status(201).json(usuario);
};

const atualizar = async (req, res) => {
    const usuario = await buscar(req.params.id);
    const dados = escolherCampos(req.body, ["nome", "email", "telefone", "tipo", "status"]);
    validarTipo(dados.tipo);
    if (String(usuario._id) === String(req.usuario._id) && dados.status === "Inativo") {
        throw new AppError("Você não pode desativar o próprio acesso");
    }
    usuario.set(dados);
    await usuario.save();
    res.json(usuario);
};

const alternarStatus = async (req, res) => {
    const usuario = await buscar(req.params.id);
    if (String(usuario._id) === String(req.usuario._id)) {
        throw new AppError("Você não pode desativar o próprio acesso");
    }
    usuario.status = usuario.status === "Ativo" ? "Inativo" : "Ativo";
    await usuario.save();
    res.json(usuario);
};

module.exports = { listar, criar, atualizar, alternarStatus };
