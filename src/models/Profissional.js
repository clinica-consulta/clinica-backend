const mongoose = require("mongoose");
const { iniciais } = require("../utils/texto");

const HORA = [/^\d{2}:\d{2}$/, "Use o formato HH:MM"];

const diaSchema = new mongoose.Schema(
    {
        ativo: { type: Boolean, default: false },
        inicio: { type: String, default: "08:00", match: HORA },
        fim: { type: String, default: "17:00", match: HORA }
    },
    { _id: false }
);

// Chaves 0 (domingo) a 6 (sábado), igual a Date.getDay().
const disponibilidadePadrao = () => ({
    1: { ativo: true, inicio: "08:00", fim: "17:00" },
    2: { ativo: true, inicio: "08:00", fim: "17:00" },
    3: { ativo: true, inicio: "08:00", fim: "17:00" },
    4: { ativo: true, inicio: "08:00", fim: "17:00" },
    5: { ativo: true, inicio: "08:00", fim: "17:00" },
    6: { ativo: false, inicio: "08:00", fim: "12:00" }
});

const profissionalSchema = new mongoose.Schema(
    {
        nome: { type: String, required: [true, "Informe o nome do profissional"], trim: true },
        iniciais: { type: String },
        especialidade: { type: String, required: [true, "Informe a especialidade"], trim: true },
        crm: { type: String, required: [true, "Informe o CRM"], trim: true },
        telefone: { type: String, trim: true, default: "" },
        email: {
            type: String,
            required: [true, "Informe o e-mail"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "E-mail inválido"]
        },
        cor: { type: String, default: "bg-info" },
        ativo: { type: Boolean, default: true },
        disponibilidade: { type: Map, of: diaSchema, default: disponibilidadePadrao }
    },
    { timestamps: true }
);

profissionalSchema.pre("save", function () {
    if (this.isModified("nome")) this.iniciais = iniciais(this.nome);
});

module.exports = mongoose.model("Profissional", profissionalSchema);
