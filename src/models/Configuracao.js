const mongoose = require("mongoose");

// Documento único com os dados e preferências da clínica.
const configuracaoSchema = new mongoose.Schema(
    {
        nome: { type: String, default: "Clínica Vita" },
        cnpj: { type: String, default: "" },
        telefone: { type: String, default: "" },
        email: { type: String, default: "" },
        antecedenciaLembreteHoras: { type: Number, default: 24, min: 1 },
        confirmacaoAutomatica: { type: Boolean, default: false },
        valorConsulta: { type: Number, default: 150, min: 0 }
    },
    { timestamps: true }
);

configuracaoSchema.statics.obter = async function () {
    return (await this.findOne()) ?? this.create({});
};

module.exports = mongoose.model("Configuracao", configuracaoSchema, "configuracoes");
