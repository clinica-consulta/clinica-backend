const { Router } = require("express");

const rotas = Router();

rotas.get("/", (_req, res) => {
    res.json({ mensagem: "API Gestão de Consultas funcionando!" });
});

rotas.use("/auth", require("./authRoutes"));

module.exports = rotas;
