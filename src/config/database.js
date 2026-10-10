// const dns = require("dns");
// const mongoose = require("mongoose");

// dns.setServers(["8.8.8.8", "8.8.4.4"]);

// const conectarBanco = async () => {
//     try {
//         await mongoose.connect(process.env.MONGODB_URI);

//         console.log("MongoDB conectado com sucesso!");
//     } catch (erro) {
//         console.error("Erro ao conectar ao MongoDB:", erro);
//         process.exit(1);
//     }
// };

// module.exports = conectarBanco;


const mongoose = require("mongoose");

const conectarBanco = async () => {
    try {
        console.log("Tentando conectar ao MongoDB...");

        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000
        });

        console.log("MongoDB conectado com sucesso!");
    } catch (erro) {
        console.error("Erro ao conectar ao MongoDB:", erro);
        process.exit(1);
    }
};

module.exports = conectarBanco;