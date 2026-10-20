require("./config/mongoose");

const express = require("express");
const cors = require("cors");

const rotas = require("./routes");
const { rotaNaoEncontrada, tratarErros } = require("./middlewares/erros");

const app = express();

const origens = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((origem) => origem.trim())
    .filter(Boolean);

app.use(cors(origens.length ? { origin: origens } : {}));
app.use(express.json());

app.get("/", (_req, res) => {
    res.json({ mensagem: "API Gestão de Consultas funcionando!", documentacao: "/api" });
});

app.use("/api", rotas);

app.use(rotaNaoEncontrada);
app.use(tratarErros);

module.exports = app;
