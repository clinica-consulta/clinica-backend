const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "segredo-dos-testes";
process.env.SENHA_PADRAO = "123456";

const app = require("../src/app");
const { conectarBanco, desconectarBanco } = require("../src/config/database");
const { popularBanco } = require("../src/seed/popular");
const { dataISO, diaDaSemana } = require("../src/utils/datas");

// Usa um banco separado para não apagar os dados de desenvolvimento.
const URI = process.env.MONGODB_URI_TESTE || "mongodb://127.0.0.1:27017/gestao-consultas-teste";

const api = () => request(app);
const tokens = {};
const como = (perfil) => ({ Authorization: `Bearer ${tokens[perfil]}` });

// Próxima segunda-feira daqui a pelo menos 7 dias (fora dos dados de demonstração).
const proximaSegunda = () => {
    for (let dias = 7; ; dias += 1) {
        if (diaDaSemana(dataISO(dias)) === 1) return dataISO(dias);
    }
};

before(async () => {
    await conectarBanco(URI);
    await popularBanco();
    for (const perfil of ["recepcao", "paciente", "profissional", "admin"]) {
        const resposta = await api().post("/api/auth/login").send({ email: `${perfil}@demo.com`, senha: "123456" });
        assert.equal(resposta.status, 200, `login de ${perfil}`);
        tokens[perfil] = resposta.body.token;
    }
});

after(async () => {
    const mongoose = require("mongoose");
    await mongoose.connection.dropDatabase();
    await desconectarBanco();
});

describe("autenticação", () => {
    it("recusa senha errada", async () => {
        const resposta = await api().post("/api/auth/login").send({ email: "admin@demo.com", senha: "errada" });
        assert.equal(resposta.status, 401);
    });

    it("bloqueia rotas sem token", async () => {
        assert.equal((await api().get("/api/consultas")).status, 401);
    });

    it("retorna o usuário logado sem a senha", async () => {
        const resposta = await api().get("/api/auth/me").set(como("paciente"));
        assert.equal(resposta.body.tipo, "paciente");
        assert.equal(resposta.body.senha, undefined);
        assert.ok(resposta.body.paciente);
    });

    it("cadastra um novo paciente e já entra", async () => {
        const resposta = await api().post("/api/auth/cadastro").send({
            nome: "Lucas Teste",
            cpf: "999.888.777-66",
            telefone: "(11) 90000-0000",
            email: "lucas@teste.com",
            senha: "senha123",
            dataNascimento: "2000-01-01",
            convenio: "Particular"
        });
        assert.equal(resposta.status, 201);
        assert.ok(resposta.body.token);
        assert.equal(resposta.body.usuario.tipo, "paciente");
    });

    it("não deixa cadastrar o mesmo e-mail duas vezes", async () => {
        const resposta = await api().post("/api/auth/cadastro").send({
            nome: "Outro",
            cpf: "1",
            email: "paciente@demo.com",
            senha: "123456"
        });
        assert.equal(resposta.status, 409);
    });
});

describe("permissões por perfil", () => {
    it("paciente vê só as próprias consultas", async () => {
        const eu = await api().get("/api/auth/me").set(como("paciente"));
        const resposta = await api().get("/api/consultas").set(como("paciente"));
        assert.ok(resposta.body.length > 0);
        assert.ok(resposta.body.every((consulta) => consulta.paciente === eu.body.paciente));
    });

    it("paciente não acessa a fila de espera nem cria especialidade", async () => {
        assert.equal((await api().get("/api/fila-espera").set(como("paciente"))).status, 403);
        assert.equal((await api().post("/api/especialidades").set(como("paciente")).send({ nome: "X" })).status, 403);
    });

    it("recepção não gerencia usuários internos", async () => {
        assert.equal((await api().get("/api/usuarios").set(como("recepcao"))).status, 403);
    });
});

describe("agendamento", () => {
    let ana;
    let consultaId;
    const data = proximaSegunda();

    before(async () => {
        const profissionais = await api().get("/api/profissionais").set(como("recepcao"));
        ana = profissionais.body.find((item) => item.email === "profissional@demo.com");
    });

    it("lista horários livres de 30 em 30 minutos", async () => {
        const resposta = await api().get(`/api/consultas/horarios?profissional=${ana.id}&data=${data}`).set(como("paciente"));
        assert.equal(resposta.status, 200);
        assert.equal(resposta.body.horarios[0], "08:00");
        assert.ok(resposta.body.horarios.includes("16:30"));
        assert.ok(!resposta.body.horarios.includes("17:00"));
    });

    it("paciente agenda para si e o horário sai da lista", async () => {
        const resposta = await api()
            .post("/api/consultas")
            .set(como("paciente"))
            .send({ profissional: ana.id, data, hora: "09:00", observacoes: "Primeira vez" });
        assert.equal(resposta.status, 201);
        assert.equal(resposta.body.canal, "Paciente");
        assert.equal(resposta.body.status, "Agendada");
        assert.equal(resposta.body.especialidade, "Cardiologia");
        consultaId = resposta.body.id;

        const horarios = await api().get(`/api/consultas/horarios?profissional=${ana.id}&data=${data}`).set(como("recepcao"));
        assert.ok(!horarios.body.horarios.includes("09:00"));
    });

    it("recusa horário já ocupado", async () => {
        const pacientes = await api().get("/api/pacientes").set(como("recepcao"));
        const camila = pacientes.body.find((item) => item.email === "camila@email.com");
        const resposta = await api()
            .post("/api/consultas")
            .set(como("recepcao"))
            .send({ paciente: camila.id, profissional: ana.id, data, hora: "09:00" });
        assert.equal(resposta.status, 409);
    });

    it("bloqueia convênio sem cobertura", async () => {
        const pacientes = await api().get("/api/pacientes").set(como("recepcao"));
        const roberto = pacientes.body.find((item) => item.email === "roberto@email.com");
        const resposta = await api()
            .post("/api/consultas")
            .set(como("recepcao"))
            .send({ paciente: roberto.id, profissional: ana.id, data, hora: "10:00" });
        assert.equal(resposta.status, 422);
        assert.match(resposta.body.mensagem, /não cobre Cardiologia/);
    });

    it("paciente confirma e recebe o aviso", async () => {
        const resposta = await api().patch(`/api/consultas/${consultaId}/status`).set(como("paciente")).send({ status: "Confirmada" });
        assert.equal(resposta.status, 200);
        assert.equal(resposta.body.respostaConfirmacao, "Confirmou");

        const avisos = await api().get("/api/notificacoes").set(como("paciente"));
        assert.ok(avisos.body.some((item) => item.titulo === "Consulta confirmada" && item.lida === false));
    });

    it("paciente não pode marcar como realizada", async () => {
        const resposta = await api().patch(`/api/consultas/${consultaId}/status`).set(como("paciente")).send({ status: "Realizada" });
        assert.equal(resposta.status, 403);
    });

    it("recepção remarca e o histórico registra", async () => {
        const resposta = await api().patch(`/api/consultas/${consultaId}/remarcar`).set(como("recepcao")).send({ data, hora: "11:00" });
        assert.equal(resposta.status, 200);
        assert.equal(resposta.body.status, "Remarcada");
        assert.equal(resposta.body.hora, "11:00");
        assert.ok(resposta.body.historico.some((item) => item.texto.startsWith("Remarcada de")));
    });

    it("bloqueio de agenda remove os horários do período", async () => {
        const criado = await api()
            .post("/api/bloqueios")
            .set(como("recepcao"))
            .send({ profissional: ana.id, dataInicio: data, horaInicio: "14:00", horaFim: "16:00", motivo: "Congresso" });
        assert.equal(criado.status, 201);
        const horarios = await api().get(`/api/consultas/horarios?profissional=${ana.id}&data=${data}`).set(como("recepcao"));
        assert.ok(!horarios.body.horarios.includes("14:30"));
        assert.ok(horarios.body.horarios.includes("16:00"));
    });

    it("cancelamento libera o horário", async () => {
        await api().patch(`/api/consultas/${consultaId}/status`).set(como("paciente")).send({ status: "Cancelada" });
        const horarios = await api().get(`/api/consultas/horarios?profissional=${ana.id}&data=${data}`).set(como("recepcao"));
        assert.ok(horarios.body.horarios.includes("11:00"));
    });

    it("envia lembretes pendentes uma única vez", async () => {
        const primeira = await api().post("/api/consultas/lembretes").set(como("recepcao"));
        assert.equal(primeira.status, 200);
        const segunda = await api().post("/api/consultas/lembretes").set(como("recepcao"));
        assert.equal(segunda.body.enviados, 0);
    });
});

describe("cadastros da administração", () => {
    it("cria profissional com acesso e senha padrão", async () => {
        const criado = await api().post("/api/profissionais").set(como("admin")).send({
            nome: "Dr. Teste Novo",
            especialidade: "Dermatologia",
            crm: "CRM 1",
            email: "novo.medico@clinica.com"
        });
        assert.equal(criado.status, 201);
        const login = await api().post("/api/auth/login").send({ email: "novo.medico@clinica.com", senha: "123456" });
        assert.equal(login.status, 200);
        assert.equal(login.body.usuario.tipo, "profissional");
    });

    it("desativar paciente bloqueia o login dele", async () => {
        const pacientes = await api().get("/api/pacientes").set(como("recepcao"));
        const carlos = pacientes.body.find((item) => item.email === "carlos@email.com");
        await api().patch(`/api/pacientes/${carlos.id}/status`).set(como("recepcao"));
        const login = await api().post("/api/auth/login").send({ email: "carlos@email.com", senha: "123456" });
        assert.equal(login.status, 403);
    });

    it("renomear especialidade atualiza os profissionais", async () => {
        const lista = await api().get("/api/especialidades");
        const derma = lista.body.find((item) => item.nome === "Dermatologia");
        await api().put(`/api/especialidades/${derma.id}`).set(como("admin")).send({ nome: "Dermatologia clínica" });
        const profissionais = await api().get("/api/profissionais?especialidade=Dermatologia clínica").set(como("admin"));
        assert.ok(profissionais.body.length >= 1);
    });

    it("atualiza as configurações da clínica", async () => {
        const resposta = await api().put("/api/configuracoes").set(como("recepcao")).send({ confirmacaoAutomatica: true });
        assert.equal(resposta.body.confirmacaoAutomatica, true);
    });
});
