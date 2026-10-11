const { Router } = require("express");
const controller = require("../controllers/usuarioController");
const { autenticar, permitir } = require("../middlewares/auth");

const rotas = Router();

rotas.use(autenticar, permitir("administrador"));

rotas.get("/", controller.listar);
rotas.post("/", controller.criar);
rotas.put("/:id", controller.atualizar);
rotas.patch("/:id/status", controller.alternarStatus);

module.exports = rotas;
