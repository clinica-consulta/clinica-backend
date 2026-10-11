const mongoose = require("mongoose");
const { iniciais } = require("../utils/texto");

const pacienteSchema = new mongoose.Schema(
    {
        nome: { type: String, required: [true, "Informe o nome do paciente"], trim: true },
        iniciais: { type: String },
        cpf: { type: String, required: [true, "Informe o CPF"], unique: true, trim: true },
        telefone: { type: String, trim: true, default: "" },
        email: {
            type: String,
            required: [true, "Informe o e-mail"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "E-mail inválido"]
        },
        dataNascimento: { type: String, default: "" },
        convenio: { type: String, default: "Particular" },
        status: { type: String, enum: ["Ativo", "Inativo"], default: "Ativo" }
    },
    { timestamps: true }
);

pacienteSchema.pre("save", function () {
    if (this.isModified("nome")) this.iniciais = iniciais(this.nome);
});

module.exports = mongoose.model("Paciente", pacienteSchema);
