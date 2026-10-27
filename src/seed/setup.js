const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

// Na primeira vez, cria o .env local (ele não vai para o GitHub) com um segredo aleatório para os logins.
// Em hospedagem (Render), as variáveis já vêm do painel e o .env não é criado.
const ARQUIVO_ENV = path.resolve(__dirname, "../../.env");
if (!fs.existsSync(ARQUIVO_ENV) && !process.env.MONGODB_URI) {
    fs.writeFileSync(
        ARQUIVO_ENV,
        [
            "PORT=3000",
            "MONGODB_URI=mongodb://127.0.0.1:27017/clinica-senai",
            `JWT_SECRET=${crypto.randomBytes(48).toString("hex")}`,
            "JWT_EXPIRES_IN=8h",
            "CORS_ORIGIN=",
            "SENHA_PADRAO=123456",
            ""
        ].join("\n")
    );
    console.log("Arquivo .env criado (MongoDB local, banco clinica-senai).");
}
require("dotenv").config({ path: ARQUIVO_ENV, quiet: true });

const mongoose = require("mongoose");
const { conectarBanco, desconectarBanco } = require("../config/database");
const Usuario = require("../models/Usuario");
const Profissional = require("../models/Profissional");
const Especialidade = require("../models/Especialidade");
const Convenio = require("../models/Convenio");
const Configuracao = require("../models/Configuracao");

// Cria o banco da Clínica Senai com os acessos iniciais.
// A senha do administrador é pedida no terminal na primeira vez (ou lida de ADMIN_SENHA no .env) e nunca fica no código.
//   npm run setup              -> cria o que faltar (quem já existe mantém a senha)
//   npm run setup -- --limpar  -> APAGA o banco inteiro antes
// Pacientes, médicos e demais cadastros são feitos depois pelo site, com o login do administrador.

const SENHA_PADRAO = () => process.env.SENHA_PADRAO || "123456";

const DADOS = {
    clinica: {
        nome: "Clínica Senai",
        cnpj: "12.345.678/0001-90",
        telefone: "(11) 3333-4444",
        email: "contato@senai.org.br"
    },
    especialidades: ["Clínica geral", "Cardiologia", "Pediatria"],
    convenios: ["Particular", "Unimed"],
    administradores: [{ nome: "Marco", email: "marco@senai.org.br", pedirSenha: true }],
    recepcionistas: [{ nome: "Juliana Souza", email: "recepcao@senai.org.br", telefone: "(11) 98888-1111" }],
    profissionais: [
        {
            nome: "Dr. Carlos Mendes",
            email: "carlos.mendes@senai.org.br",
            especialidade: "Clínica geral",
            crm: "CRM-SP 123456",
            telefone: "(11) 98888-2222"
        }
    ]
};

// Cria o usuário se ainda não existir. Usuário existente mantém a senha que já tem.
const perguntarSenha = async (email) => {
    if (process.env.ADMIN_SENHA) return process.env.ADMIN_SENHA;
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    const pergunta = `Senha para ${email} (mínimo 6 caracteres): `;
    try {
        process.stdout.write(pergunta);
        for await (const linha of terminal) {
            const senha = linha.trim();
            if (senha.length >= 6) return senha;
            process.stdout.write(`Senha curta demais, tente de novo.\n${pergunta}`);
        }
        throw new Error("Nenhuma senha informada para o administrador");
    } finally {
        terminal.close();
    }
};

const garantirUsuario = async ({ pedirSenha, ...dados }, tipo, extras = {}) => {
    const email = String(dados.email).toLowerCase().trim();
    const existente = await Usuario.findOne({ email });
    if (existente) {
        existente.set({ nome: dados.nome, telefone: dados.telefone ?? existente.telefone, tipo, status: "Ativo", ...extras });
        await existente.save();
        return { usuario: existente, criado: false };
    }
    const senha = pedirSenha ? await perguntarSenha(email) : SENHA_PADRAO();
    const usuario = await Usuario.create({ nome: dados.nome, email, telefone: dados.telefone ?? "", senha, tipo, ...extras });
    return { usuario, criado: true, senhaPropria: Boolean(pedirSenha) };
};

const executar = async () => {
    try {
        await conectarBanco();

        if (process.argv.includes("--limpar")) {
            console.log("Apagando TODOS os dados do banco...");
            await mongoose.connection.dropDatabase();
        }
        await Promise.all(Object.values(mongoose.models).map((modelo) => modelo.syncIndexes()));

        const configuracao = await Configuracao.obter();
        configuracao.set(DADOS.clinica);
        await configuracao.save();

        for (const nome of DADOS.especialidades) {
            await Especialidade.updateOne({ nome }, { $setOnInsert: { nome, ativo: true } }, { upsert: true });
        }
        for (const nome of DADOS.convenios) {
            await Convenio.updateOne({ nome }, { $setOnInsert: { nome, coberturas: [], ativo: true } }, { upsert: true });
        }

        const resumo = [];
        const registrar = (perfil, { usuario, criado, senhaPropria }) =>
            resumo.push(`  ${perfil.padEnd(14)} ${usuario.email.padEnd(32)} ${criado ? `criado (senha: ${senhaPropria ? "a que você digitou" : SENHA_PADRAO()})` : "já existia (senha mantida)"}`);

        for (const admin of DADOS.administradores) registrar("Administrador", await garantirUsuario(admin, "administrador"));
        for (const item of DADOS.recepcionistas) registrar("Recepção", await garantirUsuario(item, "recepcionista"));
        for (const item of DADOS.profissionais) {
            const profissional = (await Profissional.findOne({ email: item.email })) ?? new Profissional({ email: item.email });
            profissional.set({ ...item, ativo: true });
            await profissional.save();
            registrar("Profissional", await garantirUsuario(item, "profissional", { profissional: profissional._id }));
        }

        console.log(`\nPronto! Banco "${mongoose.connection.name}" da ${DADOS.clinica.nome}. Acessos:`);
        console.log(resumo.join("\n"));
        console.log("\nPacientes se cadastram pelo site. Médicos, recepcionistas e convênios novos: entre como administrador.\n");
    } catch (erro) {
        console.error("Erro no setup:", erro.message);
        process.exitCode = 1;
    } finally {
        await desconectarBanco().catch(() => undefined);
    }
};

executar();
