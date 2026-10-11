const mongoose = require("mongoose");

const filaEsperaSchema = new mongoose.Schema(
    {
        paciente: { type: mongoose.Schema.Types.ObjectId, ref: "Paciente", required: [true, "Informe o paciente"] },
        especialidade: { type: String, required: [true, "Informe a especialidade"], trim: true },
        preferencia: { type: String, trim: true, default: "Qualquer horário" },
        prioridade: { type: String, enum: ["Alta", "Normal"], default: "Normal" },
        status: { type: String, enum: ["Aguardando", "Convidado"], default: "Aguardando" },
        entradaEm: { type: String, required: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("FilaEspera", filaEsperaSchema);
