const { Router } = require("express");
const auth = require("../controllers/authController");
const { autenticar } = require("../middlewares/auth");

const rotas = Router();

rotas.post("/login", auth.login);
rotas.post("/cadastro", auth.cadastro);
rotas.post("/recuperar-senha", auth.recuperarSenha);
rotas.post("/redefinir-senha", auth.redefinirSenha);
rotas.get("/me", autenticar, auth.perfil);
rotas.patch("/senha", autenticar, auth.alterarSenha);

module.exports = rotas;
