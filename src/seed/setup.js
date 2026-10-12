require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { conectarBanco, desconectarBanco } = require("../config/database");
const Usuario = require("../models/Usuario");
const Profissional = require("../models/Profissional");
const Especialidade = require("../models/Especialidade");
const Convenio = require("../models/Convenio");
const Configuracao = require("../models/Configuracao");

// Prepara o banco para uso real, sem dados fictícios.
//   npm run setup              -> cria/atualiza o que estiver em dados-iniciais.json
//   npm run setup -- --limpar  -> APAGA tudo antes (inclusive os dados de demonstração)
// Sem dados-iniciais.json, cria só o administrador definido no .env (ADMIN_NOME, ADMIN_EMAIL, ADMIN_SENHA).

const ARQUIVO = path.resolve(__dirname, "../../dados-iniciais.json");
const SENHA_PADRAO = () => process.env.SENHA_PADRAO || "123456";

const lerDados = () => {
    if (fs.existsSync(ARQUIVO)) {
        console.log(`Lendo ${path.basename(ARQUIVO)}...`);
        return JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    }
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_SENHA) {
        throw new Error(
            "Crie o arquivo dados-iniciais.json (copie de dados-iniciais.example.json) " +
                "ou defina ADMIN_NOME, ADMIN_EMAIL e ADMIN_SENHA no .env"
        );
    }
    return {
        administradores: [
            { nome: process.env.ADMIN_NOME || "Administrador", email: process.env.ADMIN_EMAIL, senha: process.env.ADMIN_SENHA }
        ]
    };
};

// Cria o usuário se ainda não existir. Usuário existente mantém a senha que já tem.
const garantirUsuario = async (dados, tipo, extras = {}) => {
    const email = String(dados.email).toLowerCase().trim();
    const existente = await Usuario.findOne({ email });
    if (existente) {
        existente.set({ nome: dados.nome, telefone: dados.telefone ?? existente.telefone, tipo, status: "Ativo", ...extras });
        await existente.save();
        return { usuario: existente, criado: false };
    }
    const usuario = await Usuario.create({
        nome: dados.nome,
        email,
        telefone: dados.telefone ?? "",
        senha: dados.senha || SENHA_PADRAO(),
        tipo,
        ...extras
    });
    return { usuario, criado: true };
};

const executar = async () => {
    const limpar = process.argv.includes("--limpar");
    try {
        const dados = lerDados();
        await conectarBanco();

        if (limpar) {
            console.log("Apagando TODOS os dados do banco...");
            await mongoose.connection.dropDatabase();
        }
        await Promise.all(Object.values(mongoose.models).map((modelo) => modelo.syncIndexes()));

        const configuracao = await Configuracao.obter();
        if (dados.clinica) {
            configuracao.set(dados.clinica);
            await configuracao.save();
        }

        for (const nome of dados.especialidades ?? []) {
            await Especialidade.updateOne({ nome }, { $setOnInsert: { nome, ativo: true } }, { upsert: true });
        }

        // "Particular" sempre existe para o cadastro de pacientes funcionar.
        // Aceita { "nome": "Unimed", "coberturas": [] } ou só "Unimed" (cobre todas as especialidades).
        const convenios = (dados.convenios ?? []).map((item) => (typeof item === "string" ? { nome: item } : item)).filter((item) => item.nome);
        if (!convenios.some((item) => item.nome === "Particular")) convenios.unshift({ nome: "Particular", coberturas: [] });
        for (const convenio of convenios) {
            await Convenio.updateOne({ nome: convenio.nome }, { $set: { coberturas: convenio.coberturas ?? [] } }, { upsert: true });
        }

        const resumo = [];
        const registrar = (perfil, usuario, criado, senhaInformada) =>
            resumo.push(`  ${perfil.padEnd(14)} ${usuario.email.padEnd(36)} ${criado ? `criado (senha: ${senhaInformada ? "a do arquivo" : SENHA_PADRAO()})` : "já existia (senha mantida)"}`);

        for (const admin of dados.administradores ?? []) {
            const { usuario, criado } = await garantirUsuario(admin, "administrador");
            registrar("Administrador", usuario, criado, admin.senha);
        }
        for (const recepcionista of dados.recepcionistas ?? []) {
            const { usuario, criado } = await garantirUsuario(recepcionista, "recepcionista");
            registrar("Recepção", usuario, criado, recepcionista.senha);
        }
        for (const item of dados.profissionais ?? []) {
            const { senha, ...campos } = item;
            await Especialidade.updateOne({ nome: campos.especialidade }, { $setOnInsert: { nome: campos.especialidade, ativo: true } }, { upsert: true });
            const email = String(campos.email).toLowerCase().trim();
            const profissional =
                (await Profissional.findOne({ email })) ?? new Profissional({ email });
            profissional.set({ ...campos, email, ativo: true });
            await profissional.save();
            const { usuario, criado } = await garantirUsuario({ ...campos, senha }, "profissional", { profissional: profissional._id });
            registrar("Profissional", usuario, criado, senha);
        }

        console.log("\nPronto! Acessos:");
        console.log(resumo.join("\n") || "  (nenhum usuário no arquivo)");
        console.log("\nPeça para cada pessoa trocar a senha no primeiro acesso (clicando no próprio nome no topo do site).\n");
    } catch (erro) {
        console.error("Erro no setup:", erro.message);
        process.exitCode = 1;
    } finally {
        await desconectarBanco().catch(() => undefined);
    }
};

executar();
