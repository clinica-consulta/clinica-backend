const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const TIPOS = ["paciente", "recepcionista", "profissional", "administrador"];

const usuarioSchema = new mongoose.Schema(
    {
        nome: { type: String, required: [true, "Informe o nome"], trim: true },
        email: {
            type: String,
            required: [true, "Informe o e-mail"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "E-mail inválido"]
        },
        senha: { type: String, required: true, select: false },
        tipo: { type: String, required: true, enum: TIPOS },
        status: { type: String, enum: ["Ativo", "Inativo", "Pendente"], default: "Ativo" },
        telefone: { type: String, trim: true, default: "" },
        paciente: { type: mongoose.Schema.Types.ObjectId, ref: "Paciente", default: null },
        profissional: { type: mongoose.Schema.Types.ObjectId, ref: "Profissional", default: null },
        tokenRedefinicao: { type: String, select: false },
        tokenRedefinicaoExpira: { type: Date, select: false }
    },
    { timestamps: true }
);

usuarioSchema.pre("save", async function () {
    if (this.isModified("senha")) {
        this.senha = await bcrypt.hash(this.senha, 10);
    }
});

usuarioSchema.methods.senhaConfere = function (senha) {
    return bcrypt.compare(senha, this.senha);
};

usuarioSchema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.senha;
        delete ret.tokenRedefinicao;
        delete ret.tokenRedefinicaoExpira;
        return ret;
    }
});

const Usuario = mongoose.model("Usuario", usuarioSchema, "usuarios");

module.exports = Usuario;
module.exports.TIPOS = TIPOS;
