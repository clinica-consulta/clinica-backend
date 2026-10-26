const crypto = require("crypto");
const Usuario = require("../models/Usuario");
const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const AppError = require("../utils/AppError");
const { gerarToken } = require("../middlewares/auth");
const { enviarEmail } = require("../services/emailService");
const { cpfValido, formatarCpf } = require("../utils/cpf");

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

// O próprio usuário atualiza nome e telefone (e-mail e perfil ficam com a administração).
const atualizarPerfil = async (req, res) => {
    const usuario = req.usuario;
    if (req.body?.nome !== undefined) usuario.nome = req.body.nome;
    if (req.body?.telefone !== undefined) usuario.telefone = req.body.telefone;
    await usuario.save();

    // Mantém o cadastro ligado com o mesmo nome (save recalcula as iniciais).
    const cadastro = usuario.paciente
        ? await Paciente.findById(usuario.paciente)
        : usuario.profissional
          ? await Profissional.findById(usuario.profissional)
          : null;
    if (cadastro) {
        cadastro.set({ nome: usuario.nome, telefone: usuario.telefone });
        await cadastro.save();
    }
    res.json(usuario);
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
const EMAIL_VALIDO = /^\S+@\S+\.\S+$/;
const hashCodigo = (codigo) => crypto.createHash("sha256").update(String(codigo)).digest("hex");

// Passo 1: confere se o e-mail existe e envia um código de 6 dígitos (válido por 15 minutos).
const recuperarSenha = async (req, res) => {
    const email = String(req.body?.email ?? "").toLowerCase().trim();
    if (!EMAIL_VALIDO.test(email)) throw new AppError("Digite um e-mail válido");

    const usuario = await Usuario.findOne({ email });
    if (!usuario) throw new AppError("Não encontramos nenhuma conta com este e-mail", 404);
    if (usuario.status === "Inativo") throw new AppError("Este acesso está desativado. Fale com a clínica.", 403);

    // Paciente confirma a identidade com o CPF do cadastro. A equipe não tem CPF no sistema.
    if (usuario.tipo === "paciente") {
        const cpf = String(req.body?.cpf ?? "");
        if (!cpfValido(cpf)) throw new AppError("Digite um CPF válido");
        const paciente = await Paciente.findById(usuario.paciente);
        if (!paciente || formatarCpf(paciente.cpf) !== formatarCpf(cpf)) {
            throw new AppError("O CPF não confere com o cadastro deste e-mail", 400);
        }
    }

    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    usuario.tokenRedefinicao = hashCodigo(codigo);
    usuario.tokenRedefinicaoExpira = new Date(Date.now() + 15 * 60 * 1000);
    usuario.tentativasRedefinicao = 0;
    await usuario.save();

    const enviado = await enviarEmail({
        para: email,
        assunto: "Código para redefinir sua senha",
        texto: `Olá, ${usuario.nome}!\n\nSeu código para redefinir a senha é: ${codigo}\nEle vale por 15 minutos.\n\nSe não foi você, ignore este e-mail.`
    }).catch((erro) => {
        console.error("Falha ao enviar e-mail:", erro.message);
        return false;
    });

    if (enviado) return res.json({ mensagem: `Enviamos um código para ${email}.` });

    // Sem SMTP configurado (ambiente de teste/local): o código aparece no terminal da API e na tela.
    console.log(`[recuperar-senha] Código para ${email}: ${codigo} (válido por 15 minutos)`);
    res.json({ mensagem: "E-mail confirmado. Como o envio de e-mail não está configurado, o código aparece aqui.", codigoTeste: codigo });
};

// Passo 2: confere o código e grava a nova senha.
const redefinirSenha = async (req, res) => {
    const email = String(req.body?.email ?? "").toLowerCase().trim();
    const { codigo, novaSenha } = req.body ?? {};
    if (!email || !codigo) throw new AppError("Informe o e-mail e o código recebido");
    if (!novaSenha || String(novaSenha).length < 6) throw new AppError("A nova senha precisa ter pelo menos 6 caracteres");

    const usuario = await Usuario.findOne({ email, tokenRedefinicaoExpira: { $gt: new Date() } }).select(
        "+tokenRedefinicao +tentativasRedefinicao"
    );
    if (!usuario?.tokenRedefinicao) throw new AppError("Código inválido ou expirado. Peça um novo código.", 400);
    if (usuario.tokenRedefinicao !== hashCodigo(String(codigo).trim())) {
        // Depois de 5 erros o código é descartado, para ninguém ficar chutando números.
        usuario.tentativasRedefinicao = (usuario.tentativasRedefinicao ?? 0) + 1;
        if (usuario.tentativasRedefinicao >= 5) {
            usuario.tokenRedefinicao = undefined;
            usuario.tokenRedefinicaoExpira = undefined;
        }
        await usuario.save();
        throw new AppError("Código inválido ou expirado", 400);
    }

    usuario.senha = novaSenha;
    usuario.tokenRedefinicao = undefined;
    usuario.tokenRedefinicaoExpira = undefined;
    usuario.tentativasRedefinicao = 0;
    await usuario.save();
    res.json({ mensagem: "Senha redefinida com sucesso" });
};

module.exports = { login, cadastro, perfil, atualizarPerfil, alterarSenha, recuperarSenha, redefinirSenha };
