const { Router } = require("express");
const controller = require("../controllers/relatorioController");
const { autenticar, permitir, EQUIPE } = require("../middlewares/auth");

const rotas = Router();

rotas.get("/resumo", autenticar, permitir(...EQUIPE), controller.resumo);

module.exports = rotas;
