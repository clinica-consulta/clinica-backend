const express = require("express");
const cors = require("cors");
require("dotenv").config();

const conectarBanco = require("./config/database");
const Usuario = require("./models/Usuario");
const bcrypt = require("bcryptjs");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        mensagem: "API Gestão de Consultas funcionando!"
    });
});

app.post("/usuarios", async (req, res) => {
    try {
        const senhaCriptografada = await bcrypt.hash(req.body.senha, 10);

        const dadosUsuario = {
            nome: req.body.nome,
            email: req.body.email,
            senha: senhaCriptografada,
            tipo: req.body.tipo
        };

        const usuario = await Usuario.create(dadosUsuario);

        res.status(201).json(usuario);
    } catch (erro) {
        res.status(500).json({
            mensagem: "Erro ao cadastrar usuário",
            erro: erro.message
        });
    }
});

app.get("/usuarios", async (req, res) => {
    try {
        const usuarios = await Usuario.find();

        res.json(usuarios);
    } catch (erro) {
        res.status(500).json({
            mensagem: "Erro ao buscar usuários",
            erro: erro.message
        });
    }
});

app.get("/usuarios/:id", async (req, res) => {
    try {
        const usuario = await Usuario.findById(req.params.id);

        if (!usuario) {
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        res.json(usuario);
    } catch (erro) {
        res.status(500).json({
            mensagem: "Erro ao buscar usuário",
            erro: erro.message
        });
    }
});

app.put("/usuarios/:id", async (req, res) => {
    try {
        const usuario = await Usuario.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        if (!usuario) {
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        res.json(usuario);
    } catch (erro) {
        res.status(500).json({
            mensagem: "Erro ao atualizar usuário",
            erro: erro.message
        });
    }
});

app.delete("/usuarios/:id", async (req, res) => {
    try {
        const usuario = await Usuario.findByIdAndDelete(req.params.id);

        if (!usuario) {
            return res.status(404).json({
                mensagem: "Usuário não encontrado"
            });
        }

        res.json({
            mensagem: "Usuário excluído com sucesso!"
        });
    } catch (erro) {
        res.status(500).json({
            mensagem: "Erro ao excluir usuário",
            erro: erro.message
        });
    }
});

const PORT = process.env.PORT || 3000;

conectarBanco();

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});