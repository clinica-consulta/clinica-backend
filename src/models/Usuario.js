const mongoose = require("mongoose");

const usuarioSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true,
        unique: true
    },

    senha: {
        type: String,
        required: true
    },

    tipo: {
        type: String,
        required: true,
        enum: ["paciente", "recepcionista", "profissional", "administrador"]
    }
});

const Usuario = mongoose.model("Usuario", usuarioSchema);

module.exports = Usuario;