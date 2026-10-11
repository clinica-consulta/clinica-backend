const crypto = require("crypto");
const Usuario = require("../models/Usuario");
const Paciente = require("../models/Paciente");
const AppError = require("../utils/AppError");
const { gerarToken } = require("../middlewares/auth");

const respostaDeSessao = (usuario) => ({ token: gerarToken(usuario), usuario });

const login = async (req, res) => {
    const { email, senha } = req.body ?? {};
    if (!email || !senha) throw new AppError("Informe e-mail e senha");

    const usuario = await Usuario.findOne({ email: String(email).toLowerCase().trim() }).select("+senha");
    if (!usuario || !(await usuario.senhaConfere(String(senha)))) {
        throw new AppError("E-mail ou senha incorretos", 401);
    }
    if (usuario.status === "Inativo") throw new AppError("Seu acesso está desativado", 403);

    res.json(respostaDeSessao(usuario));
};

// Cadastro público: cria o paciente e o usuário de acesso dele.
const cadastro = async (req, res) => {
    const { nome, cpf, telefone, email, senha, dataNascimento, convenio } = req.body ?? {};
    if (!senha || String(senha).length < 6) throw new AppError("A senha precisa ter pelo menos 6 caracteres");

    const emailNormalizado = String(email ?? "").toLowerCase().trim();
    if (await Usuario.exists({ email: emailNormalizado })) {
        throw new AppError("Já existe uma conta com este e-mail", 409);
    }

    const paciente = await Paciente.create({ nome, cpf, telefone, email: emailNormalizado, dataNascimento, convenio });
    try {
        const usuario = await Usuario.create({
            nome,
            email: emailNormalizado,
            senha,
            telefone,
            tipo: "paciente",
            paciente: paciente._id
        });
        res.status(201).json(respostaDeSessao(usuario));
    } catch (erro) {
        await paciente.deleteOne();
        throw erro;
    }
};

const perfil = (req, res) => {
    res.json(req.usuario);
};

const alterarSenha = async (req, res) => {
    const { senhaAtual, novaSenha } = req.body ?? {};
    if (!novaSenha || String(novaSenha).length < 6) throw new AppError("A nova senha precisa ter pelo menos 6 caracteres");

    const usuario = await Usuario.findById(req.usuario._id).select("+senha");
    if (!(await usuario.senhaConfere(String(senhaAtual ?? "")))) throw new AppError("Senha atual incorreta", 401);

    usuario.senha = novaSenha;
    await usuario.save();
    res.json({ mensagem: "Senha alterada com sucesso" });
};

// Gera um token de redefinição. Sem serviço de e-mail configurado, o link é exibido no console da API.
const recuperarSenha = async (req, res) => {
    const email = String(req.body?.email ?? "").toLowerCase().trim();
    const usuario = await Usuario.findOne({ email });

    if (usuario) {
        const token = crypto.randomBytes(20).toString("hex");
        usuario.tokenRedefinicao = crypto.createHash("sha256").update(token).digest("hex");
        usuario.tokenRedefinicaoExpira = new Date(Date.now() + 60 * 60 * 1000);
        await usuario.save();
        console.log(`[recuperar-senha] Token para ${email}: ${token} (válido por 1 hora)`);
    }

    res.json({ mensagem: "Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição." });
};

const redefinirSenha = async (req, res) => {
    const { token, novaSenha } = req.body ?? {};
    if (!token || !novaSenha || String(novaSenha).length < 6) {
        throw new AppError("Informe o token e uma nova senha com pelo menos 6 caracteres");
    }

    const hash = crypto.createHash("sha256").update(String(token)).digest("hex");
    const usuario = await Usuario.findOne({
        tokenRedefinicao: hash,
        tokenRedefinicaoExpira: { $gt: new Date() }
    });
    if (!usuario) throw new AppError("Token inválido ou expirado", 400);

    usuario.senha = novaSenha;
    usuario.tokenRedefinicao = undefined;
    usuario.tokenRedefinicaoExpira = undefined;
    await usuario.save();
    res.json({ mensagem: "Senha redefinida com sucesso" });
};

module.exports = { login, cadastro, perfil, alterarSenha, recuperarSenha, redefinirSenha };
