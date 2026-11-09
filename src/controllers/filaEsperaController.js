const FilaEspera = require("../models/FilaEspera");
const AppError = require("../utils/AppError");
const { entrarNaFila, aceitarOferta, sairDaFila, posicaoNaFila } = require("../services/filaEsperaService");

const ehEquipe = (usuario) => ["recepcionista", "administrador"].includes(usuario.tipo);

// A equipe vê e mexe em todas as entradas; o paciente, só nas dele.
const buscar = async (req, id) => {
    const entrada = await FilaEspera.findById(id);
    if (!entrada) throw new AppError("Entrada da lista de espera não encontrada", 404);
    if (!ehEquipe(req.usuario) && String(entrada.paciente) !== String(req.usuario.paciente)) {
        throw new AppError("Entrada da lista de espera não encontrada", 404);
    }
    return entrada;
};

const comPosicao = async (entrada) => ({ ...entrada.toJSON(), posicao: await posicaoNaFila(entrada) });

const listar = async (req, res) => {
    const filtro = ehEquipe(req.usuario) ? {} : { paciente: req.usuario.paciente };
    if (req.query.status) filtro.status = req.query.status;
    const fila = await FilaEspera.find(filtro).sort({ data: 1, hora: 1, createdAt: 1 });
    res.json(await Promise.all(fila.map(comPosicao)));
};

// POST /fila-espera { profissional, data, hora, alternativa?: { profissional, data, hora }, consultaAlternativa?, paciente? (equipe) }
const adicionar = async (req, res) => {
    const { profissional, data, hora, alternativa, consultaAlternativa } = req.body ?? {};
    const equipe = ehEquipe(req.usuario);
    const resultado = await entrarNaFila({
        pacienteId: equipe ? req.body?.paciente : req.usuario.paciente,
        profissionalId: profissional,
        data,
        hora,
        alternativa,
        consultaAlternativaId: consultaAlternativa,
        // A recepção pode pôr na lista quem já tem outra consulta combinada por telefone.
        exigirAlternativa: !equipe,
        canal: equipe ? "Recepção" : "Paciente"
    });
    res.status(201).json({ ...(await comPosicao(resultado.entrada)), consultaAlternativaCriada: resultado.consultaAlternativa ?? null });
};

const aceitar = async (req, res) => {
    const entrada = await buscar(req, req.params.id);
    res.json(await aceitarOferta(entrada));
};

// Recusar a vaga oferecida ou sair da lista: a vaga (se houver) passa para o próximo.
const remover = async (req, res) => {
    const entrada = await buscar(req, req.params.id);
    await sairDaFila(entrada);
    res.json({ mensagem: "Saiu da lista de espera" });
};

module.exports = { listar, adicionar, aceitar, remover };
