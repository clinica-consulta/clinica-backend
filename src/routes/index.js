const { Router } = require("express");

const rotas = Router();

rotas.get("/", (_req, res) => {
    res.json({ mensagem: "API Gestão de Consultas funcionando!" });
});

rotas.use("/auth", require("./authRoutes"));
rotas.use("/usuarios", require("./usuarioRoutes"));
rotas.use("/pacientes", require("./pacienteRoutes"));
rotas.use("/profissionais", require("./profissionalRoutes"));
rotas.use("/consultas", require("./consultaRoutes"));
rotas.use("/bloqueios", require("./bloqueioRoutes"));
rotas.use("/fila-espera", require("./filaEsperaRoutes"));
rotas.use("/notificacoes", require("./notificacaoRoutes"));
rotas.use("/especialidades", require("./especialidadeRoutes"));
rotas.use("/convenios", require("./convenioRoutes"));
rotas.use("/configuracoes", require("./configuracaoRoutes"));

module.exports = rotas;
