const { Router } = require("express");
const controller = require("../controllers/notificacaoController");
const { autenticar, permitir, EQUIPE } = require("../middlewares/auth");

const rotas = Router();

rotas.use(autenticar);

rotas.get("/", controller.listar);
rotas.post("/", permitir(...EQUIPE, "profissional"), controller.criar);
rotas.patch("/lidas", controller.marcarTodasComoLidas);
rotas.patch("/:id/lida", controller.marcarComoLida);

module.exports = rotas;
