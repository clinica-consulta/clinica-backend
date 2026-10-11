const { Router } = require("express");

const rotas = Router();

rotas.get("/", (_req, res) => {
    res.json({ mensagem: "API Gestão de Consultas funcionando!" });
});

module.exports = rotas;
