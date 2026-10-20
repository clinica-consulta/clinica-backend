const mongoose = require("mongoose");

const conectarBanco = async (uri = process.env.MONGODB_URI) => {
    if (!uri) {
        throw new Error("MONGODB_URI não definida. Copie o .env.example para .env e preencha.");
    }

    console.log("Tentando conectar ao MongoDB...");

    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000
    });

    console.log(`MongoDB conectado com sucesso! (banco: ${mongoose.connection.name})`);
};

const desconectarBanco = () => mongoose.disconnect();

module.exports = { conectarBanco, desconectarBanco };
