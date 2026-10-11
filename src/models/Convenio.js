const mongoose = require("mongoose");

// Lista de especialidades cobertas. Lista vazia = cobre todas (ex.: Particular).
const convenioSchema = new mongoose.Schema(
    {
        nome: { type: String, required: [true, "Informe o nome do convênio"], unique: true, trim: true },
        coberturas: { type: [String], default: [] },
        ativo: { type: Boolean, default: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Convenio", convenioSchema);
