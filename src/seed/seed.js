require("dotenv").config({ quiet: true });

const { conectarBanco, desconectarBanco } = require("../config/database");
const { popularBanco } = require("./popular");

const executar = async () => {
    try {
        await conectarBanco();
        console.log("Apagando dados antigos e criando os dados de demonstração...");
        await popularBanco();

        const senha = process.env.SENHA_PADRAO || "123456";
        console.log("\nPronto! Logins de demonstração (senha: %s):", senha);
        console.log("  Recepção ....... recepcao@demo.com");
        console.log("  Paciente ....... paciente@demo.com");
        console.log("  Profissional ... profissional@demo.com");
        console.log("  Administrador .. admin@demo.com\n");
    } catch (erro) {
        console.error("Erro ao popular o banco:", erro.message);
        process.exitCode = 1;
    } finally {
        await desconectarBanco();
    }
};

executar();
