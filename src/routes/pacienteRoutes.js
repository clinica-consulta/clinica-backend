const { Router } = require("express");
const controller = require("../controllers/pacienteController");
const { autenticar, permitir, EQUIPE } = require("../middlewares/auth");

const rotas = Router();

rotas.use(autenticar);

rotas.get("/", controller.listar);
rotas.get("/:id", controller.obter);
rotas.post("/", permitir(...EQUIPE), controller.criar);
rotas.put("/:id", permitir(...EQUIPE, "paciente"), controller.atualizar);
rotas.patch("/:id/status", permitir(...EQUIPE), controller.alternarStatus);

module.exports = rotas;
