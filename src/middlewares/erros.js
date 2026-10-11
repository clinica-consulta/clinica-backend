const mongoose = require("mongoose");
const AppError = require("../utils/AppError");

const rotaNaoEncontrada = (req, _res, next) => {
    next(new AppError(`Rota ${req.method} ${req.originalUrl} não encontrada`, 404));
};

// eslint-disable-next-line no-unused-vars
const tratarErros = (erro, _req, res, _next) => {
    if (erro instanceof AppError) {
        return res.status(erro.status).json({ mensagem: erro.message });
    }

    if (erro instanceof mongoose.Error.ValidationError) {
        const detalhes = Object.values(erro.errors).map((item) => item.message);
        return res.status(400).json({ mensagem: "Dados inválidos", detalhes });
    }

    if (erro instanceof mongoose.Error.CastError) {
        return res.status(400).json({ mensagem: `Identificador inválido: ${erro.value}` });
    }

    if (erro.code === 11000) {
        const campo = Object.keys(erro.keyValue ?? {})[0] ?? "campo";
        return res.status(409).json({ mensagem: `Já existe um cadastro com este ${campo}` });
    }

    if (erro.type === "entity.parse.failed") {
        return res.status(400).json({ mensagem: "JSON inválido no corpo da requisição" });
    }

    console.error(erro);
    return res.status(500).json({ mensagem: "Erro interno do servidor" });
};

module.exports = { rotaNaoEncontrada, tratarErros };
