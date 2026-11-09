const { Router } = require("express");
const controller = require("../controllers/filaEsperaController");
const { autenticar, permitir, EQUIPE } = require("../middlewares/auth");

const rotas = Router();

// Equipe e paciente: cada um vê e mexe só no que pode (o controlador confere).
rotas.use(autenticar, permitir(...EQUIPE, "paciente"));

rotas.get("/", controller.listar);
rotas.post("/", controller.adicionar);
rotas.post("/:id/aceitar", controller.aceitar);
rotas.delete("/:id", controller.remover);

module.exports = rotas;
