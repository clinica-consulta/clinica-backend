require("dotenv").config({ quiet: true });

const app = require("./app");
const { conectarBanco } = require("./config/database");
const { iniciarEncerramentoAutomatico } = require("./services/cicloConsultaService");

const PORT = process.env.PORT || 3000;

const iniciar = async () => {
    try {
        await conectarBanco();
        // Encerra sozinho, 1 hora após o horário, as consultas que ficaram sem resultado registrado.
        iniciarEncerramentoAutomatico();
        app.listen(PORT, () => {
            console.log(`Servidor rodando em http://localhost:${PORT}`);
        });
    } catch (erro) {
        console.error("Não foi possível iniciar a API:", erro.message);
        process.exit(1);
    }
};

iniciar();
