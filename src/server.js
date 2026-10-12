require("dotenv").config({ quiet: true });

const app = require("./app");
const { conectarBanco } = require("./config/database");

const PORT = process.env.PORT || 3000;

const iniciar = async () => {
    try {
        await conectarBanco();
        app.listen(PORT, () => {
            console.log(`Servidor rodando em http://localhost:${PORT}`);
        });
    } catch (erro) {
        console.error("Não foi possível iniciar a API:", erro.message);
        process.exit(1);
    }
};

iniciar();
