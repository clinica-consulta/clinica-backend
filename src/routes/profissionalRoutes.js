const { Router } = require("express");
const controller = require("../controllers/profissionalController");
const { autenticar, permitir, EQUIPE } = require("../middlewares/auth");

const rotas = Router();

rotas.use(autenticar);

rotas.get("/", controller.listar);
rotas.get("/:id", controller.obter);
// A recepção também cadastra médicos e ajusta os horários deles.
rotas.post("/", permitir(...EQUIPE), controller.criar);
rotas.put("/:id", permitir(...EQUIPE, "profissional"), controller.atualizar);
rotas.patch("/:id/status", permitir(...EQUIPE), controller.alternarStatus);
rotas.delete("/:id", permitir("administrador"), controller.excluir);
rotas.put("/:id/disponibilidade/:dia", permitir(...EQUIPE), controller.definirDisponibilidade);

module.exports = rotas;
