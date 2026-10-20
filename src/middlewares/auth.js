const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");
const AppError = require("../utils/AppError");

const segredo = () => {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET não definido. Rode npm run setup para gerar o .env");
    return process.env.JWT_SECRET;
};

const gerarToken = (usuario) =>
    jwt.sign({ id: String(usuario._id), tipo: usuario.tipo }, segredo(), {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h"
    });

// Exige o cabeçalho "Authorization: Bearer <token>" e carrega req.usuario.
const autenticar = async (req, _res, next) => {
    const [esquema, token] = (req.headers.authorization || "").split(" ");
    if (esquema !== "Bearer" || !token) {
        throw new AppError("Faça login para continuar", 401);
    }

    let dados;
    try {
        dados = jwt.verify(token, segredo());
    } catch {
        throw new AppError("Sessão expirada ou inválida. Faça login novamente", 401);
    }

    const usuario = await Usuario.findById(dados.id);
    if (!usuario) throw new AppError("Usuário não encontrado", 401);
    if (usuario.status === "Inativo") throw new AppError("Seu acesso está desativado", 403);

    req.usuario = usuario;
    next();
};

// Libera a rota apenas para os perfis informados.
const permitir = (...tipos) => (req, _res, next) => {
    if (!tipos.includes(req.usuario?.tipo)) {
        throw new AppError("Você não tem permissão para esta ação", 403);
    }
    next();
};

const EQUIPE = ["recepcionista", "administrador"];

module.exports = { gerarToken, autenticar, permitir, EQUIPE };
