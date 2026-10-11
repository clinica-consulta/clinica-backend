const { Router } = require("express");
const controller = require("../controllers/profissionalController");
const { autenticar, permitir } = require("../middlewares/auth");

const rotas = Router();

rotas.use(autenticar);

rotas.get("/", controller.listar);
rotas.get("/:id", controller.obter);
rotas.post("/", permitir("administrador"), controller.criar);
rotas.put("/:id", permitir("administrador", "profissional"), controller.atualizar);
rotas.patch("/:id/status", permitir("administrador"), controller.alternarStatus);
rotas.put("/:id/disponibilidade/:dia", permitir("administrador"), controller.definirDisponibilidade);

module.exports = rotas;
