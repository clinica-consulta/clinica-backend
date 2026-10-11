const mongoose = require("mongoose");
const { TIPOS } = require("./Usuario");

// "publico" diz quais perfis veem o aviso. Se "paciente" ou "profissional" estiver
// preenchido, só aquele paciente/profissional vê (dentro do respectivo perfil).
const notificacaoSchema = new mongoose.Schema(
    {
        titulo: { type: String, required: [true, "Informe o título"], trim: true },
        texto: { type: String, required: [true, "Informe o texto"], trim: true },
        publico: {
            type: [{ type: String, enum: TIPOS }],
            validate: [(lista) => lista.length > 0, "Informe ao menos um perfil"]
        },
        paciente: { type: mongoose.Schema.Types.ObjectId, ref: "Paciente", default: null },
        profissional: { type: mongoose.Schema.Types.ObjectId, ref: "Profissional", default: null },
        lidaPor: { type: [mongoose.Schema.Types.ObjectId], ref: "Usuario", default: [] }
    },
    { timestamps: true }
);

notificacaoSchema.statics.filtroPara = function (usuario) {
    const filtro = { publico: usuario.tipo };
    if (usuario.tipo === "paciente") filtro.paciente = { $in: [null, usuario.paciente] };
    if (usuario.tipo === "profissional") filtro.profissional = { $in: [null, usuario.profissional] };
    return filtro;
};

notificacaoSchema.methods.paraUsuario = function (usuario) {
    const { lidaPor, ...dados } = this.toJSON();
    return { ...dados, lida: lidaPor.some((id) => String(id) === String(usuario._id)) };
};

module.exports = mongoose.model("Notificacao", notificacaoSchema, "notificacoes");
