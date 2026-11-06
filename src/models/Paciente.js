const mongoose = require("mongoose");
const { cpfValido, formatarCpf } = require("../utils/cpf");
const { iniciais } = require("../utils/texto");

const pacienteSchema = new mongoose.Schema(
    {
        nome: { type: String, required: [true, "Informe o nome do paciente"], trim: true },
        iniciais: { type: String },
        cpf: {
            type: String,
            required: [true, "Informe o CPF"],
            unique: true,
            set: formatarCpf,
            validate: [cpfValido, "CPF inválido. Confira os números."]
        },
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
        // Carteirinha do convênio. Obrigatória para quem não é Particular.
        carteirinha: {
            numero: { type: String, trim: true, default: "" },
            validade: { type: String, default: "" },
            plano: { type: String, trim: true, default: "" }
        },
        status: { type: String, enum: ["Ativo", "Inativo"], default: "Ativo" }
    },
    { timestamps: true }
);

// Ao cadastrar ou trocar o convênio (ou a carteirinha), exige os dados completos da carteirinha.
// Cadastros antigos sem carteirinha continuam válidos até alguém mexer no convênio.
pacienteSchema.pre("validate", function () {
    const mexeuNoConvenio = this.isNew || this.isModified("convenio") || this.isModified("carteirinha");
    if (!mexeuNoConvenio || !this.convenio || this.convenio === "Particular") return;
    const { numero, validade, plano } = this.carteirinha ?? {};
    if (!numero) this.invalidate("carteirinha.numero", "Informe o número da carteirinha do convênio");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validade ?? "")) this.invalidate("carteirinha.validade", "Informe a validade da carteirinha");
    if (!plano) this.invalidate("carteirinha.plano", "Informe o plano do convênio");
});

pacienteSchema.pre("save", function () {
    if (this.isModified("nome")) this.iniciais = iniciais(this.nome);
});

module.exports = mongoose.model("Paciente", pacienteSchema, "pacientes");
