const mongoose = require("mongoose");

const especialidadeSchema = new mongoose.Schema(
    {
        nome: { type: String, required: [true, "Informe o nome da especialidade"], unique: true, trim: true },
        ativo: { type: Boolean, default: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Especialidade", especialidadeSchema, "especialidades");
