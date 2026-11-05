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
        historico: { type: [registroSchema], default: [] },
        // Cobrança criada quando a consulta de um paciente particular é realizada.
        // Com MP_ACCESS_TOKEN definido, o pagamento é feito pelo Mercado Pago.
        pagamento: {
            status: { type: String, enum: ["Pendente", "Pago", null], default: null },
            valor: { type: Number, default: 0 },
            metodo: { type: String, default: "" },
            codigo: { type: String, default: "" },
            pagoEm: { type: Date, default: null },
            gateway: { type: String, enum: ["", "Mercado Pago", "Recepção"], default: "" },
            // Link do checkout do Mercado Pago e identificadores da transação.
            linkPagamento: { type: String, default: "" },
            preferenciaId: { type: String, default: "" },
            transacaoId: { type: String, default: "" },
            situacaoGateway: { type: String, default: "" }
        }
    },
    { timestamps: true }
);

consultaSchema.index({ profissional: 1, data: 1, hora: 1 });
consultaSchema.index({ paciente: 1, data: -1 });

module.exports = mongoose.model("Consulta", consultaSchema, "consultas");
module.exports.STATUS = STATUS;
module.exports.STATUS_ABERTOS = STATUS_ABERTOS;
