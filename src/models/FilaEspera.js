const mongoose = require("mongoose");

// Lista de espera de um horário já marcado (médico + data + hora), com até 5 pacientes.
// Quem entra escolhe um horário livre como alternativa (consultaAlternativa), que fica marcado.
// Quando o horário desejado vaga, o primeiro da lista recebe a oferta ("Oferecido") e pode ficar com ele:
// a consulta alternativa passa para o horário desejado.
const filaEsperaSchema = new mongoose.Schema(
    {
        paciente: { type: mongoose.Schema.Types.ObjectId, ref: "Paciente", required: [true, "Informe o paciente"] },
        especialidade: { type: String, required: [true, "Informe a especialidade"], trim: true },
        // Horário desejado. Entradas antigas (só por especialidade) não têm.
        profissional: { type: mongoose.Schema.Types.ObjectId, ref: "Profissional", default: null },
        data: { type: String, default: "" },
        hora: { type: String, default: "" },
        consultaAlternativa: { type: mongoose.Schema.Types.ObjectId, ref: "Consulta", default: null },
        preferencia: { type: String, trim: true, default: "" },
        prioridade: { type: String, enum: ["Alta", "Normal"], default: "Normal" },
        // "Convidado" é das entradas antigas, por especialidade.
        status: { type: String, enum: ["Aguardando", "Oferecido", "Convidado"], default: "Aguardando" },
        oferta: {
            em: { type: Date, default: null },
            expiraEm: { type: Date, default: null }
        },
        entradaEm: { type: String, required: true }
    },
    { timestamps: true }
);

filaEsperaSchema.index({ profissional: 1, data: 1, hora: 1, status: 1 });

module.exports = mongoose.model("FilaEspera", filaEsperaSchema, "fila_espera");
