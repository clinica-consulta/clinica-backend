const mongoose = require("mongoose");
const Usuario = require("../models/Usuario");
const Paciente = require("../models/Paciente");
const Profissional = require("../models/Profissional");
const Especialidade = require("../models/Especialidade");
const Convenio = require("../models/Convenio");
const Configuracao = require("../models/Configuracao");
const Consulta = require("../models/Consulta");
const Contador = require("../models/Contador");
const Bloqueio = require("../models/Bloqueio");
const FilaEspera = require("../models/FilaEspera");
const Notificacao = require("../models/Notificacao");
const dados = require("./dados");

// Apaga o banco atual e recria os dados de demonstração.
const popularBanco = async ({ senha = process.env.SENHA_PADRAO || "123456" } = {}) => {
    await mongoose.connection.dropDatabase();
    await Promise.all(Object.values(mongoose.models).map((modelo) => modelo.syncIndexes()));

    await Especialidade.insertMany(dados.especialidades);
    await Convenio.insertMany(dados.convenios);
    await Configuracao.create(dados.configuracao);

    const idDe = {};

    for (const { chave, ...paciente } of dados.pacientes) {
        const criado = await Paciente.create(paciente);
        idDe[chave] = criado._id;
        await Usuario.create({
            nome: criado.nome,
            email: criado.email,
            telefone: criado.telefone,
            senha,
            tipo: "paciente",
            status: criado.status,
            paciente: criado._id
        });
    }

    for (const { chave, ...profissional } of dados.profissionais) {
        const criado = await Profissional.create(profissional);
        idDe[chave] = criado._id;
        await Usuario.create({
            nome: criado.nome,
            email: criado.email,
            telefone: criado.telefone,
            senha,
            tipo: "profissional",
            profissional: criado._id
        });
    }

    for (const membro of dados.equipe) {
        await Usuario.create({ ...membro, senha });
    }

    const especialidadeDe = Object.fromEntries(dados.profissionais.map((item) => [item.chave, item.especialidade]));
    await Consulta.insertMany(
        dados.consultas.map((consulta) => ({
            ...consulta,
            especialidade: especialidadeDe[consulta.profissional],
            paciente: idDe[consulta.paciente],
            profissional: idDe[consulta.profissional]
        }))
    );
    const maiorCodigo = Math.max(...dados.consultas.map((item) => Number(item.codigo)));
    await Contador.create({ _id: "consulta", valor: maiorCodigo });

    await Bloqueio.insertMany(dados.bloqueios.map((item) => ({ ...item, profissional: idDe[item.profissional] })));
    await FilaEspera.insertMany(dados.filaEspera.map((item) => ({ ...item, paciente: idDe[item.paciente] })));
    await Notificacao.insertMany(
        dados.notificacoes.map((item) => ({ ...item, paciente: item.paciente ? idDe[item.paciente] : null }))
    );
};

module.exports = { popularBanco };
