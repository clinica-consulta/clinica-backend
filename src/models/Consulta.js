const mongoose = require("mongoose");

const STATUS = ["Agendada", "Confirmada", "Remarcada", "Realizada", "Cancelada", "Não compareceu"];
const STATUS_ABERTOS = ["Agendada", "Confirmada", "Remarcada"];

const registroSchema = new mongoose.Schema(
    {
        em: { type: String, required: true },
        texto: { type: String, required: true }
    },
    { _id: false }
);

const consultaSchema = new mongoose.Schema(
    {
        codigo: { type: String, required: true, unique: true },
        data: { type: String, required: [true, "Informe a data"], match: [/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato AAAA-MM-DD"] },
        hora: { type: String, required: [true, "Informe o horário"], match: [/^\d{2}:\d{2}$/, "Use o horário no formato HH:MM"] },
        paciente: { type: mongoose.Schema.Types.ObjectId, ref: "Paciente", required: true },
        profissional: { type: mongoose.Schema.Types.ObjectId, ref: "Profissional", required: true },
        especialidade: { type: String, required: true },
        status: { type: String, enum: STATUS, default: "Agendada" },
        observacoes: { type: String, trim: true, default: "" },
        canal: { type: String, enum: ["Paciente", "Recepção"], default: "Recepção" },
        lembreteEnviadoEm: { type: String, default: null },
        respostaConfirmacao: { type: String, enum: ["Confirmou", "Cancelou", "Sem resposta"], default: "Sem resposta" },
        historico: { type: [registroSchema], default: [] }
    },
    { timestamps: true }
);

consultaSchema.index({ profissional: 1, data: 1, hora: 1 });
consultaSchema.index({ paciente: 1, data: -1 });

module.exports = mongoose.model("Consulta", consultaSchema, "consultas");
module.exports.STATUS = STATUS;
module.exports.STATUS_ABERTOS = STATUS_ABERTOS;
