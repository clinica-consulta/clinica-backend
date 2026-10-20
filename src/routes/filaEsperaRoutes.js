const { Router } = require("express");
const controller = require("../controllers/filaEsperaController");
const { autenticar, permitir, EQUIPE } = require("../middlewares/auth");

const rotas = Router();

rotas.use(autenticar, permitir(...EQUIPE));

rotas.get("/", controller.listar);
rotas.post("/", controller.adicionar);
rotas.patch("/:id/convidar", controller.convidar);
rotas.delete("/:id", controller.remover);

module.exports = rotas;
