const mongoose = require("mongoose");

// Sequência simples para gerar códigos legíveis (ex.: consulta #1054).
const contadorSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    valor: { type: Number, default: 0 }
});

contadorSchema.statics.proximo = async function (nome, inicial = 1000) {
    await this.updateOne({ _id: nome }, { $setOnInsert: { valor: inicial } }, { upsert: true });
    const contador = await this.findByIdAndUpdate(nome, { $inc: { valor: 1 } }, { new: true });
    return contador.valor;
};

module.exports = mongoose.model("Contador", contadorSchema, "contadores");
