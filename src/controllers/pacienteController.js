const Paciente = require("../models/Paciente");
const Usuario = require("../models/Usuario");
const AppError = require("../utils/AppError");
const { escolherCampos } = require("../utils/texto");

const CAMPOS = ["nome", "cpf", "telefone", "email", "dataNascimento", "convenio"];
const ehEquipe = (usuario) => ["recepcionista", "administrador"].includes(usuario.tipo);

const buscar = async (req, id) => {
    if (req.usuario.tipo === "paciente" && String(req.usuario.paciente) !== String(id)) {
        throw new AppError("Você só pode acessar o próprio cadastro", 403);
    }
    const paciente = await Paciente.findById(id);
    if (!paciente) throw new AppError("Paciente não encontrado", 404);
    return paciente;
};

// Mantém o login do paciente com os mesmos dados do cadastro.
const sincronizarUsuario = (paciente) =>
    Usuario.updateOne(
        { paciente: paciente._id },
        { nome: paciente.nome, email: paciente.email, telefone: paciente.telefone, status: paciente.status }
    );

const listar = async (req, res) => {
    if (req.usuario.tipo === "paciente") {
        return res.json(await Paciente.find({ _id: req.usuario.paciente }));
    }
    const filtro = {};
    if (req.query.status) filtro.status = req.query.status;
    if (req.query.busca) {
        const termo = new RegExp(String(req.query.busca).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        filtro.$or = [{ nome: termo }, { cpf: termo }, { email: termo }];
    }
    res.json(await Paciente.find(filtro).sort({ nome: 1 }));
};

const obter = async (req, res) => {
    res.json(await buscar(req, req.params.id));
};

// Cadastro pela recepção: também cria o acesso do paciente com a senha padrão.
const criar = async (req, res) => {
    const dados = escolherCampos(req.body, [...CAMPOS, "status"]);
    const paciente = await Paciente.create(dados);

    if (!(await Usuario.exists({ email: paciente.email }))) {
        await Usuario.create({
            nome: paciente.nome,
            email: paciente.email,
            telefone: paciente.telefone,
            senha: process.env.SENHA_PADRAO || "123456",
            tipo: "paciente",
            status: paciente.status,
            paciente: paciente._id
        });
    }

    res.status(201).json(paciente);
};

const atualizar = async (req, res) => {
    const paciente = await buscar(req, req.params.id);
    const campos = ehEquipe(req.usuario) ? [...CAMPOS, "status"] : CAMPOS;
    paciente.set(escolherCampos(req.body, campos));
    await paciente.save();
    await sincronizarUsuario(paciente);
    res.json(paciente);
};

// Desativar preserva o histórico de consultas e bloqueia novos agendamentos.
const alternarStatus = async (req, res) => {
    const paciente = await buscar(req, req.params.id);
    paciente.status = paciente.status === "Ativo" ? "Inativo" : "Ativo";
    await paciente.save();
    await sincronizarUsuario(paciente);
    res.json(paciente);
};

module.exports = { listar, obter, criar, atualizar, alternarStatus };
