const Profissional = require("../models/Profissional");
const Usuario = require("../models/Usuario");
const AppError = require("../utils/AppError");
const { escolherCampos } = require("../utils/texto");

const CAMPOS_ADMIN = ["nome", "especialidade", "crm", "telefone", "email", "cor", "ativo"];
// O profissional atualiza só os dados de contato; agenda e especialidade ficam com a administração.
const CAMPOS_PROPRIOS = ["nome", "telefone", "email"];

const buscar = async (id) => {
    const profissional = await Profissional.findById(id);
    if (!profissional) throw new AppError("Profissional não encontrado", 404);
    return profissional;
};

const sincronizarUsuario = (profissional) =>
    Usuario.updateOne(
        { profissional: profissional._id },
        {
            nome: profissional.nome,
            email: profissional.email,
            telefone: profissional.telefone,
            status: profissional.ativo ? "Ativo" : "Inativo"
        }
    );

const listar = async (req, res) => {
    const filtro = {};
    if (req.query.especialidade) filtro.especialidade = req.query.especialidade;
    if (req.query.ativo !== undefined) filtro.ativo = req.query.ativo === "true";
    res.json(await Profissional.find(filtro).sort({ nome: 1 }));
};

const obter = async (req, res) => {
    res.json(await buscar(req.params.id));
};

// Cadastro pelo administrador: também cria o acesso do profissional com a senha padrão.
const criar = async (req, res) => {
    const profissional = await Profissional.create(escolherCampos(req.body, CAMPOS_ADMIN));

    if (!(await Usuario.exists({ email: profissional.email }))) {
        await Usuario.create({
            nome: profissional.nome,
            email: profissional.email,
            telefone: profissional.telefone,
            senha: process.env.SENHA_PADRAO || "123456",
            tipo: "profissional",
            profissional: profissional._id
        });
    }

    res.status(201).json(profissional);
};

const atualizar = async (req, res) => {
    const ehAdmin = req.usuario.tipo === "administrador";
    if (!ehAdmin && String(req.usuario.profissional) !== String(req.params.id)) {
        throw new AppError("Você só pode editar o próprio perfil", 403);
    }

    const profissional = await buscar(req.params.id);
    profissional.set(escolherCampos(req.body, ehAdmin ? CAMPOS_ADMIN : CAMPOS_PROPRIOS));
    await profissional.save();
    await sincronizarUsuario(profissional);
    res.json(profissional);
};

const alternarStatus = async (req, res) => {
    const profissional = await buscar(req.params.id);
    profissional.ativo = !profissional.ativo;
    await profissional.save();
    await sincronizarUsuario(profissional);
    res.json(profissional);
};

// PUT /profissionais/:id/disponibilidade/:dia  { ativo, inicio, fim }
const definirDisponibilidade = async (req, res) => {
    const dia = Number(req.params.dia);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) throw new AppError("Dia da semana inválido (0 a 6)");

    const profissional = await buscar(req.params.id);
    const atual = profissional.disponibilidade.get(String(dia))?.toObject() ?? {};
    const novo = { ...atual, ...escolherCampos(req.body, ["ativo", "inicio", "fim"]) };
    if (novo.ativo && novo.fim <= novo.inicio) throw new AppError("O fim do expediente deve ser depois do início");

    profissional.disponibilidade.set(String(dia), novo);
    await profissional.save();
    res.json(profissional);
};

module.exports = { listar, obter, criar, atualizar, alternarStatus, definirDisponibilidade };
