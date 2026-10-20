const FilaEspera = require("../models/FilaEspera");
const Paciente = require("../models/Paciente");
const AppError = require("../utils/AppError");
const { dataISO } = require("../utils/datas");
const { escolherCampos } = require("../utils/texto");
const { notificar } = require("../services/notificacaoService");

const buscar = async (id) => {
    const entrada = await FilaEspera.findById(id);
    if (!entrada) throw new AppError("Paciente não encontrado na fila de espera", 404);
    return entrada;
};

// Prioridade alta primeiro, depois ordem de chegada.
const listar = async (req, res) => {
    const filtro = {};
    if (req.query.especialidade) filtro.especialidade = req.query.especialidade;
    if (req.query.status) filtro.status = req.query.status;
    const fila = await FilaEspera.find(filtro).sort({ entradaEm: 1, createdAt: 1 });
    res.json(fila.sort((a, b) => (a.prioridade === b.prioridade ? 0 : a.prioridade === "Alta" ? -1 : 1)));
};

const adicionar = async (req, res) => {
    const dados = escolherCampos(req.body, ["paciente", "especialidade", "preferencia", "prioridade"]);
    if (!dados.paciente || !(await Paciente.exists({ _id: dados.paciente }))) {
        throw new AppError("Paciente não encontrado", 404);
    }
    if (await FilaEspera.exists({ paciente: dados.paciente, especialidade: dados.especialidade })) {
        throw new AppError("Este paciente já está na fila para esta especialidade", 409);
    }
    res.status(201).json(await FilaEspera.create({ ...dados, entradaEm: dataISO() }));
};

// Oferece um horário liberado ao paciente da fila.
const convidar = async (req, res) => {
    const entrada = await buscar(req.params.id);
    entrada.status = "Convidado";
    await entrada.save();

    await notificar({
        titulo: "Horário oferecido",
        texto: `Surgiu um horário em ${entrada.especialidade}. Entre em contato com a recepção para confirmar.`,
        publico: ["paciente", "recepcionista"],
        paciente: entrada.paciente
    });

    res.json(entrada);
};

const remover = async (req, res) => {
    const entrada = await buscar(req.params.id);
    await entrada.deleteOne();
    res.json({ mensagem: "Paciente removido da fila de espera" });
};

module.exports = { listar, adicionar, convidar, remover };
