const { Router } = require("express");
const controller = require("../controllers/bloqueioController");
const { autenticar, permitir, EQUIPE } = require("../middlewares/auth");

const rotas = Router();

rotas.use(autenticar);

rotas.get("/", controller.listar);
rotas.post("/", permitir(...EQUIPE), controller.criar);
rotas.delete("/:id", permitir(...EQUIPE), controller.remover);

module.exports = rotas;
