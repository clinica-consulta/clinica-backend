const { Router } = require("express");
const controller = require("../controllers/configuracaoController");
const { autenticar, permitir, EQUIPE } = require("../middlewares/auth");

const rotas = Router();

rotas.get("/", autenticar, controller.obter);
rotas.put("/", autenticar, permitir(...EQUIPE), controller.atualizar);

module.exports = rotas;
