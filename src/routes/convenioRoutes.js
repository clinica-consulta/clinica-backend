const { Router } = require("express");
const controller = require("../controllers/convenioController");
const { autenticar, permitir } = require("../middlewares/auth");

const rotas = Router();

// Listagem pública: a tela de cadastro do paciente precisa dos convênios.
rotas.get("/", controller.listar);
rotas.post("/", autenticar, permitir("administrador"), controller.criar);
rotas.put("/:id", autenticar, permitir("administrador"), controller.atualizar);
rotas.patch("/:id/status", autenticar, permitir("administrador"), controller.alternarStatus);

module.exports = rotas;
