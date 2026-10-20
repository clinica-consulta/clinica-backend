const { Router } = require("express");
const controller = require("../controllers/consultaController");
const { autenticar, permitir, EQUIPE } = require("../middlewares/auth");

const rotas = Router();

rotas.use(autenticar);

rotas.get("/", controller.listar);
rotas.get("/horarios", controller.horarios);
rotas.get("/elegibilidade", controller.elegibilidade);
rotas.post("/", permitir(...EQUIPE, "paciente"), controller.criar);
rotas.post("/lembretes", permitir(...EQUIPE), controller.enviarLembretesPendentes);
rotas.get("/:id", controller.obter);
rotas.patch("/:id/status", controller.alterarStatus);
rotas.patch("/:id/remarcar", permitir(...EQUIPE, "paciente"), controller.remarcar);
rotas.post("/:id/lembrete", permitir(...EQUIPE), controller.enviarLembrete);

module.exports = rotas;
