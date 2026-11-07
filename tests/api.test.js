const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "segredo-dos-testes";
process.env.SENHA_PADRAO = "123456";

const app = require("../src/app");
const { conectarBanco, desconectarBanco } = require("../src/config/database");
const { popularBanco } = require("../src/seed/popular");
const { dataISO, horaAtual, diaDaSemana } = require("../src/utils/datas");
const Consulta = require("../src/models/Consulta");

// Usa um banco separado para não apagar os dados de desenvolvimento.
const URI = process.env.MONGODB_URI_TESTE || "mongodb://127.0.0.1:27017/gestao-consultas-teste";

const api = () => request(app);
const tokens = {};
const como = (perfil) => ({ Authorization: `Bearer ${tokens[perfil]}` });

// Coloca a consulta no horário de atendimento (começou agora), quando o resultado pode ser registrado.
const emAtendimento = (id) => Consulta.updateOne({ _id: id }, { data: dataISO(), hora: horaAtual() });

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
            cpf: "999.888.777-14",
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

    it("recusa CPF inválido no cadastro", async () => {
        const resposta = await api().post("/api/auth/cadastro").send({
            nome: "CPF Errado",
            cpf: "123.456.789-00",
            email: "cpf.errado@teste.com",
            senha: "senha123",
            dataNascimento: "2000-01-01",
            convenio: "Particular"
        });
        assert.equal(resposta.status, 400);
    });

    it("redefine a senha com o código enviado ao e-mail", async () => {
        const inexistente = await api().post("/api/auth/recuperar-senha").send({ email: "ninguem@teste.com" });
        assert.equal(inexistente.status, 404);

        const cpfErrado = await api().post("/api/auth/recuperar-senha").send({ email: "lucas@teste.com", cpf: "529.982.247-25" });
        assert.equal(cpfErrado.status, 400);

        const pedido = await api().post("/api/auth/recuperar-senha").send({ email: "lucas@teste.com", cpf: "99988877714" });
        assert.equal(pedido.status, 200);
        assert.match(pedido.body.codigoTeste, /^\d{6}$/);

        const errado = await api().post("/api/auth/redefinir-senha").send({ email: "lucas@teste.com", codigo: "000000x", novaSenha: "outra123" });
        assert.equal(errado.status, 400);
        const certo = await api().post("/api/auth/redefinir-senha").send({ email: "lucas@teste.com", codigo: pedido.body.codigoTeste, novaSenha: "outra123" });
        assert.equal(certo.status, 200);
        const login = await api().post("/api/auth/login").send({ email: "lucas@teste.com", senha: "outra123" });
        assert.equal(login.status, 200);
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

    it("paciente só confirma depois do pedido da recepção", async () => {
        const antes = await api().patch(`/api/consultas/${consultaId}/status`).set(como("paciente")).send({ status: "Confirmada" });
        assert.equal(antes.status, 409, "sem pedido de confirmação ainda");
        const pedido = await api().post(`/api/consultas/${consultaId}/lembrete`).set(como("recepcao"));
        assert.equal(pedido.status, 200);
    });

    it("paciente confirma e recebe o aviso", async () => {
        const resposta = await api().patch(`/api/consultas/${consultaId}/status`).set(como("paciente")).send({ status: "Confirmada" });
        assert.equal(resposta.status, 200);
        assert.equal(resposta.body.respostaConfirmacao, "Confirmou");

        const avisos = await api().get("/api/notificacoes").set(como("paciente"));
        assert.ok(avisos.body.some((item) => item.titulo === "Consulta confirmada" && item.lida === false));
    });

    it("só o paciente confirma, e uma única vez", async () => {
        const pelaRecepcao = await api().patch(`/api/consultas/${consultaId}/status`).set(como("recepcao")).send({ status: "Confirmada" });
        assert.equal(pelaRecepcao.status, 403, "a recepção pede a confirmação, mas não confirma");
        const denovo = await api().patch(`/api/consultas/${consultaId}/status`).set(como("paciente")).send({ status: "Confirmada" });
        assert.equal(denovo.status, 409);
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

    it("cobra só paciente particular, depois que a consulta é realizada", async () => {
        const pacientes = await api().get("/api/pacientes").set(como("recepcao"));
        const particular = pacientes.body.find((item) => item.convenio === "Particular" && item.status === "Ativo");
        const eu = await api().get("/api/auth/me").set(como("paciente"));

        const criada = await api()
            .post("/api/consultas")
            .set(como("recepcao"))
            .send({ paciente: particular.id, profissional: ana.id, data, hora: "13:00" });
        assert.equal(criada.status, 201, JSON.stringify(criada.body));
        assert.equal(criada.body.pagamento?.status ?? null, null, "sem cobrança ao agendar");
        const medicoAntes = await api().patch(`/api/consultas/${criada.body.id}/status`).set(como("profissional")).send({ status: "Realizada" });
        assert.equal(medicoAntes.status, 409, "o médico registra o resultado só a partir do horário");

        await emAtendimento(criada.body.id);
        const realizada = await api().patch(`/api/consultas/${criada.body.id}/status`).set(como("recepcao")).send({ status: "Realizada" });
        assert.equal(realizada.body.pagamento.status, "Pendente");
        const realizadaDeNovo = await api().patch(`/api/consultas/${criada.body.id}/status`).set(como("recepcao")).send({ status: "Realizada" });
        assert.equal(realizadaDeNovo.status, 409, "registrar realizada só uma vez");
        const paga =await api().post(`/api/consultas/${criada.body.id}/pagamento`).set(como("recepcao")).send({ metodo: "Pix" });
        assert.equal(paga.status, 200);
        assert.equal(paga.body.pagamento.status, "Pago");
        const denovo = await api().post(`/api/consultas/${criada.body.id}/pagamento`).set(como("recepcao")).send({ metodo: "Pix" });
        assert.equal(denovo.status, 409);

        const deConvenio = await api()
            .post("/api/consultas")
            .set(como("recepcao"))
            .send({ paciente: eu.body.paciente, profissional: ana.id, data, hora: "13:30" });
        await emAtendimento(deConvenio.body.id);
        const semCobranca = await api().patch(`/api/consultas/${deConvenio.body.id}/status`).set(como("recepcao")).send({ status: "Realizada" });
        assert.equal(semCobranca.body.pagamento?.status ?? null, null, "convênio não recebe cobrança");
    });

    it("cobra pelo Stripe dentro do site e confirma pelo webhook", async () => {
        const Notificacao = require("../src/models/Notificacao");
        const StripeSDK = require("stripe");
        const Stripe = StripeSDK.default || StripeSDK;
        const stripeService = require("../src/services/stripeService");
        const reais = new Stripe("sk_test_fake").webhooks;
        const criadas = [];
        const sessoes = new Map();
        // Simula a API do Stripe: nenhuma chamada sai para a internet nos testes.
        stripeService.usarClienteDeTeste({
            webhooks: reais,
            checkout: {
                sessions: {
                    create: async (dados) => {
                        const sessao = {
                            id: `cs_test_${criadas.length + 1}`,
                            client_secret: `cs_test_${criadas.length + 1}_secret`,
                            status: "open",
                            payment_status: "unpaid",
                            amount_total: dados.line_items[0].price_data.unit_amount,
                            metadata: dados.metadata,
                            client_reference_id: dados.client_reference_id,
                            payment_intent: null
                        };
                        criadas.push(dados);
                        sessoes.set(sessao.id, sessao);
                        return sessao;
                    },
                    retrieve: async (id) => sessoes.get(id)
                }
            }
        });
        Object.assign(process.env, {
            STRIPE_SECRET_KEY: "sk_test_fake",
            STRIPE_PUBLISHABLE_KEY: "pk_test_fake",
            STRIPE_WEBHOOK_SECRET: "whsec_teste",
            FRONTEND_URL: "https://site.test"
        });
        const enviarWebhook = (tipo, sessao) => {
            const payload = JSON.stringify({ id: "evt_1", object: "event", type: tipo, data: { object: sessao } });
            const assinatura = reais.generateTestHeaderString({ payload, secret: "whsec_teste" });
            return api().post("/api/pagamentos/webhook").set("Content-Type", "application/json").set("Stripe-Signature", assinatura).send(payload);
        };

        try {
            const pacientes = await api().get("/api/pacientes").set(como("recepcao"));
            const particular = pacientes.body.find((item) => item.convenio === "Particular" && item.status === "Ativo");
            const livres = await api().get(`/api/consultas/horarios?profissional=${ana.id}&data=${data}`).set(como("recepcao"));
            const criada = await api()
                .post("/api/consultas")
                .set(como("recepcao"))
                .send({ paciente: particular.id, profissional: ana.id, data, hora: livres.body.horarios[0] });
            assert.equal(criada.status, 201, JSON.stringify(criada.body));

            await emAtendimento(criada.body.id);
            const realizada = await api().patch(`/api/consultas/${criada.body.id}/status`).set(como("profissional")).send({ status: "Realizada" });
            assert.equal(realizada.status, 200);
            assert.equal(realizada.body.pagamento.status, "Pendente");
            const aviso = await Notificacao.findOne({ consulta: criada.body.id, acao: "pagamento" });
            assert.ok(aviso, "paciente recebe o aviso de pagamento disponível");

            const config = await api().get("/api/pagamentos/config");
            assert.deepEqual(config.body, { gateway: "Stripe", teste: true });

            const checkout = await api().post(`/api/consultas/${criada.body.id}/pagamento/checkout`).set(como("recepcao"));
            assert.equal(checkout.status, 200, JSON.stringify(checkout.body));
            assert.equal(checkout.body.clientSecret, "cs_test_1_secret");
            assert.equal(checkout.body.chavePublica, "pk_test_fake");
            const enviada = criadas[0];
            assert.equal(enviada.ui_mode, "embedded_page");
            assert.equal(enviada.redirect_on_completion, "if_required");
            assert.equal(enviada.payment_method_types, undefined, "usa as formas de pagamento ativas no painel");
            assert.equal(enviada.line_items[0].price_data.currency, "brl");
            assert.equal(enviada.line_items[0].price_data.unit_amount, Math.round(realizada.body.pagamento.valor * 100));
            assert.equal(enviada.metadata.consulta, criada.body.id);

            // Abrir de novo reaproveita a sessão aberta.
            const denovo = await api().post(`/api/consultas/${criada.body.id}/pagamento/checkout`).set(como("recepcao"));
            assert.equal(denovo.body.clientSecret, "cs_test_1_secret");
            assert.equal(criadas.length, 1);

            // Pix enviado, mas ainda não compensado: continua pendente.
            const sessao = sessoes.get("cs_test_1");
            Object.assign(sessao, { status: "complete", payment_status: "unpaid" });
            assert.equal((await enviarWebhook("checkout.session.completed", sessao)).status, 200);
            const aguardando = await api().post(`/api/consultas/${criada.body.id}/pagamento/verificar`).set(como("recepcao"));
            assert.equal(aguardando.body.pagamento.status, "Pendente");
            assert.equal((await api().post(`/api/consultas/${criada.body.id}/pagamento/checkout`).set(como("recepcao"))).status, 409);

            // Pix compensado.
            Object.assign(sessao, {
                payment_status: "paid",
                payment_intent: { id: "pi_teste123456789", latest_charge: { payment_method_details: { type: "pix" } } }
            });
            assert.equal((await enviarWebhook("checkout.session.async_payment_succeeded", sessao)).status, 200);
            const paga = await api().get(`/api/consultas/${criada.body.id}`).set(como("recepcao"));
            assert.equal(paga.body.pagamento.status, "Pago");
            assert.equal(paga.body.pagamento.metodo, "Pix");
            assert.equal(paga.body.pagamento.gateway, "Stripe");

            // Webhook repetido não gera pagamento em dobro.
            await enviarWebhook("checkout.session.async_payment_succeeded", sessao);
            assert.equal(await Notificacao.countDocuments({ titulo: "Pagamento confirmado", consulta: criada.body.id }), 1);

            // Assinatura falsa é recusada.
            const falso = await api()
                .post("/api/pagamentos/webhook")
                .set("Content-Type", "application/json")
                .set("Stripe-Signature", "t=1,v1=abc")
                .send(JSON.stringify({ type: "checkout.session.completed", data: { object: sessao } }));
            assert.equal(falso.status, 400);
        } finally {
            stripeService.usarClienteDeTeste(null);
            for (const chave of ["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET", "FRONTEND_URL"]) delete process.env[chave];
        }
    });

    it("não oferece horários que já passaram", async () => {
        const ontem = await api().get(`/api/consultas/horarios?profissional=${ana.id}&data=${dataISO(-1)}`).set(como("recepcao"));
        assert.deepEqual(ontem.body.horarios, []);
    });

    it("só permite um lembrete por consulta", async () => {
        const consultas = await api().get("/api/consultas").set(como("recepcao"));
        const aberta = consultas.body.find((item) => !item.lembreteEnviadoEm && ["Agendada", "Confirmada", "Remarcada"].includes(item.status));
        const primeira = await api().post(`/api/consultas/${aberta.id}/lembrete`).set(como("recepcao"));
        assert.equal(primeira.status, 200);
        const segunda = await api().post(`/api/consultas/${aberta.id}/lembrete`).set(como("recepcao"));
        assert.equal(segunda.status, 409);
    });

    it("envia lembretes pendentes uma única vez", async () => {
        const primeira = await api().post("/api/consultas/lembretes").set(como("recepcao"));
        assert.equal(primeira.status, 200);
        const segunda = await api().post("/api/consultas/lembretes").set(como("recepcao"));
        assert.equal(segunda.body.enviados, 0);
    });
});

describe("ciclo da consulta", () => {
    // Agenda no primeiro horário livre da próxima segunda-feira.
    const criarConsulta = async (paciente) => {
        const profissionais = await api().get("/api/profissionais").set(como("recepcao"));
        const ana = profissionais.body.find((item) => item.email === "profissional@demo.com");
        const data = proximaSegunda();
        const livres = await api().get(`/api/consultas/horarios?profissional=${ana.id}&data=${data}`).set(como("recepcao"));
        const criada = await api().post("/api/consultas").set(como("recepcao")).send({ paciente, profissional: ana.id, data, hora: livres.body.horarios[0] });
        assert.equal(criada.status, 201, JSON.stringify(criada.body));
        return criada.body.id;
    };
    const pacientes = async () => (await api().get("/api/pacientes").set(como("recepcao"))).body;

    it("no horário de atendimento só registra o resultado", async () => {
        const particular = (await pacientes()).find((item) => item.convenio === "Particular" && item.status === "Ativo");
        const id = await criarConsulta(particular.id);
        await emAtendimento(id);
        const confirmar = await api().patch(`/api/consultas/${id}/status`).set(como("recepcao")).send({ status: "Confirmada" });
        assert.equal(confirmar.status, 403);
        const remarcar = await api().patch(`/api/consultas/${id}/remarcar`).set(como("recepcao")).send({ data: proximaSegunda(), hora: "17:30" });
        assert.equal(remarcar.status, 409);
        const lembrete = await api().post(`/api/consultas/${id}/lembrete`).set(como("recepcao"));
        assert.equal(lembrete.status, 409);

        const ausencia = await api().patch(`/api/consultas/${id}/status`).set(como("recepcao")).send({ status: "Não compareceu" });
        assert.equal(ausencia.status, 200);
        const Notificacao = require("../src/models/Notificacao");
        assert.ok(await Notificacao.exists({ consulta: id, acao: "remarcar" }), "convida o paciente a remarcar");
    });

    it("encerra sozinha 1 hora após o horário e trava a consulta", async () => {
        const lista = await pacientes();
        const particular = lista.find((item) => item.convenio === "Particular" && item.status === "Ativo");
        const outro = lista.find((item) => item.id !== particular.id && item.status === "Ativo");
        const confirmada = await criarConsulta(particular.id);
        const semResposta = await criarConsulta(outro.id);
        // Ontem, no mesmo horário: já passou bem mais de 1 hora.
        await Consulta.updateOne({ _id: confirmada }, { data: dataISO(-1), status: "Confirmada", respostaConfirmacao: "Confirmou" });
        await Consulta.updateOne({ _id: semResposta }, { data: dataISO(-1) });

        const todas = await api().get("/api/consultas").set(como("recepcao"));
        const realizada = todas.body.find((item) => item.id === confirmada);
        const faltou = todas.body.find((item) => item.id === semResposta);
        assert.equal(realizada.status, "Realizada");
        assert.equal(realizada.pagamento.status, "Pendente", "particular recebe a cobrança");
        assert.equal(faltou.status, "Não compareceu");
        const Notificacao = require("../src/models/Notificacao");
        assert.ok(await Notificacao.exists({ consulta: semResposta, acao: "remarcar" }));

        const cancelar = await api().patch(`/api/consultas/${semResposta}/status`).set(como("recepcao")).send({ status: "Cancelada" });
        assert.equal(cancelar.status, 409, "consulta encerrada não é cancelada");
        const medico = await api().patch(`/api/consultas/${semResposta}/status`).set(como("profissional")).send({ status: "Realizada" });
        assert.equal(medico.status, 409, "o médico não altera consulta encerrada");

        const lembrete = await api().post(`/api/consultas/${confirmada}/pagamento/lembrete`).set(como("recepcao"));
        assert.equal(lembrete.status, 200);
        assert.ok(lembrete.body.pagamento.lembreteEm);
        const deNovo = await api().post(`/api/consultas/${confirmada}/pagamento/lembrete`).set(como("recepcao"));
        assert.equal(deNovo.status, 409, "no máximo um lembrete de pagamento a cada 24 horas");
        const peloPaciente = await api().post(`/api/consultas/${confirmada}/pagamento/lembrete`).set(como("paciente"));
        assert.equal(peloPaciente.status, 403);
        const semCobranca = await api().post(`/api/consultas/${semResposta}/pagamento/lembrete`).set(como("recepcao"));
        assert.equal(semCobranca.status, 409);

        // A recepção corrige o resultado a qualquer momento.
        const naoAconteceu = await api().patch(`/api/consultas/${confirmada}/status`).set(como("recepcao")).send({ status: "Não compareceu" });
        assert.equal(naoAconteceu.status, 200);
        assert.equal(naoAconteceu.body.pagamento?.status ?? null, null, "a cobrança pendente é cancelada");
        const realizadaDeNovo = await api().patch(`/api/consultas/${confirmada}/status`).set(como("recepcao")).send({ status: "Realizada" });
        assert.equal(realizadaDeNovo.status, 200);
        assert.equal(realizadaDeNovo.body.pagamento.status, "Pendente", "volta a cobrar");

        const paga = await api().post(`/api/consultas/${confirmada}/pagamento`).set(como("recepcao")).send({ metodo: "Pix" });
        assert.equal(paga.status, 200);
        const depoisDePaga = await api().patch(`/api/consultas/${confirmada}/status`).set(como("recepcao")).send({ status: "Não compareceu" });
        assert.equal(depoisDePaga.status, 409, "consulta paga não deixa de ser realizada");
    });

    it("a recepção registra o resultado antes do horário", async () => {
        const particular = (await pacientes()).find((item) => item.convenio === "Particular" && item.status === "Ativo");
        const id = await criarConsulta(particular.id);
        const resposta = await api().patch(`/api/consultas/${id}/status`).set(como("recepcao")).send({ status: "Não compareceu" });
        assert.equal(resposta.status, 200);
    });

    it("pedido de confirmação avisa o paciente", async () => {
        const particular = (await pacientes()).find((item) => item.convenio === "Particular" && item.status === "Ativo");
        const id = await criarConsulta(particular.id);
        const pedido = await api().post(`/api/consultas/${id}/lembrete`).set(como("recepcao"));
        assert.equal(pedido.status, 200);
        assert.equal(pedido.body.status, "Agendada", "continua aguardando o paciente");
        const Notificacao = require("../src/models/Notificacao");
        assert.ok(await Notificacao.exists({ consulta: id, titulo: "Confirme sua consulta" }));
    });
});

describe("horários ocupados", () => {
    it("o paciente vê os horários tomados por outros pacientes, sem dados deles", async () => {
        const todas = await api().get("/api/consultas").set(como("recepcao"));
        const eu = await api().get("/api/auth/me").set(como("paciente"));
        const deOutro = todas.body.find((item) => item.paciente !== eu.body.paciente && item.status !== "Cancelada" && item.data >= dataISO());
        assert.ok(deOutro, "precisa de uma consulta futura de outro paciente");

        const resposta = await api().get("/api/consultas/ocupados").set(como("paciente"));
        assert.equal(resposta.status, 200);
        const achada = resposta.body.find((item) => item.id === deOutro.id);
        assert.ok(achada, "o horário de outro paciente aparece como ocupado");
        assert.deepEqual(Object.keys(achada).sort(), ["data", "hora", "id", "profissional"], "sem dados do paciente");

        const semLogin = await api().get("/api/consultas/ocupados");
        assert.equal(semLogin.status, 401);
    });
});

describe("exclusão de paciente", () => {
    it("exclui cadastro, login e consultas, e libera o CPF e o e-mail", async () => {
        const dados = { nome: "Paciente Para Excluir", cpf: "390.533.447-05", email: "excluir.paciente@email.com", telefone: "(11) 90000-1111", convenio: "Particular" };
        const criado = await api().post("/api/pacientes").set(como("recepcao")).send(dados);
        assert.equal(criado.status, 201, JSON.stringify(criado.body));
        const login = await api().post("/api/auth/login").send({ email: dados.email, senha: "123456" });
        assert.equal(login.status, 200, "o paciente tem acesso");

        const pelaPaciente = await api().delete(`/api/pacientes/${criado.body.id}`).set(como("paciente"));
        assert.equal(pelaPaciente.status, 403);
        const excluido = await api().delete(`/api/pacientes/${criado.body.id}`).set(como("recepcao"));
        assert.equal(excluido.status, 204);

        const semAcesso = await api().post("/api/auth/login").send({ email: dados.email, senha: "123456" });
        assert.equal(semAcesso.status, 401, "o login some junto");
        const deNovo = await api().post("/api/pacientes").set(como("recepcao")).send(dados);
        assert.equal(deNovo.status, 201, "o mesmo CPF e e-mail podem ser cadastrados de novo");
    });

    it("não exclui paciente com consulta paga", async () => {
        const pagas = await Consulta.findOne({ "pagamento.status": "Pago" });
        assert.ok(pagas, "precisa de uma consulta paga nos testes anteriores");
        const resposta = await api().delete(`/api/pacientes/${pagas.paciente}`).set(como("recepcao"));
        assert.equal(resposta.status, 409);
        assert.match(resposta.body.mensagem, /desative/);
    });
});

describe("convênio e carteirinha", () => {
    const dadosBase = (sufixo) => ({
        nome: `Paciente Convênio ${sufixo}`,
        cpf: sufixo === "A" ? "111.444.777-35" : "529.982.247-25",
        email: `convenio.${sufixo.toLowerCase()}@email.com`,
        telefone: "(11) 90000-0000"
    });

    it("exige a carteirinha completa para quem tem convênio", async () => {
        const sem = await api().post("/api/pacientes").set(como("recepcao")).send({ ...dadosBase("A"), convenio: "Saúde Total" });
        assert.equal(sem.status, 400, JSON.stringify(sem.body));
        assert.match(sem.body.detalhes.join(" "), /carteirinha/i);

        const particular = await api().post("/api/pacientes").set(como("recepcao")).send({ ...dadosBase("A"), convenio: "Particular" });
        assert.equal(particular.status, 201, "particular não precisa de carteirinha");
    });

    it("carteirinha vencida bloqueia o agendamento", async () => {
        const criado = await api()
            .post("/api/pacientes")
            .set(como("recepcao"))
            .send({ ...dadosBase("B"), convenio: "Saúde Total", carteirinha: { numero: "123", plano: "Enfermaria", validade: dataISO(-1) } });
        assert.equal(criado.status, 201, JSON.stringify(criado.body));
        assert.equal(criado.body.carteirinha.numero, "123");

        const vencida = await api().get(`/api/consultas/elegibilidade?paciente=${criado.body.id}&especialidade=Cardiologia`).set(como("recepcao"));
        assert.equal(vencida.body.ok, false);
        assert.match(vencida.body.mensagem ?? vencida.body.motivo, /venceu/);

        await api().put(`/api/pacientes/${criado.body.id}`).set(como("recepcao")).send({ carteirinha: { numero: "123", plano: "Enfermaria", validade: dataISO(365) } });
        const valida = await api().get(`/api/consultas/elegibilidade?paciente=${criado.body.id}&especialidade=Cardiologia`).set(como("recepcao"));
        assert.equal(valida.body.ok, true, JSON.stringify(valida.body));
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

    it("recepção também cadastra médicos", async () => {
        const criado = await api().post("/api/profissionais").set(como("recepcao")).send({
            nome: "Dra. Recepção Cadastrou",
            especialidade: "Pediatria",
            crm: "CRM 2",
            email: "pela.recepcao@clinica.com"
        });
        assert.equal(criado.status, 201);
    });

    it("administrador exclui médico sem consultas e o acesso dele some", async () => {
        const criado = await api().post("/api/profissionais").set(como("admin")).send({
            nome: "Dr. Para Excluir",
            especialidade: "Pediatria",
            crm: "CRM 3",
            email: "excluir.medico@clinica.com"
        });
        const pelaRecepcao = await api().delete(`/api/profissionais/${criado.body.id}`).set(como("recepcao"));
        assert.equal(pelaRecepcao.status, 403);
        const excluido = await api().delete(`/api/profissionais/${criado.body.id}`).set(como("admin"));
        assert.equal(excluido.status, 204);
        const login = await api().post("/api/auth/login").send({ email: "excluir.medico@clinica.com", senha: "123456" });
        assert.equal(login.status, 401);
    });

    it("não exclui médico com consultas registradas", async () => {
        const profissionais = await api().get("/api/profissionais").set(como("admin"));
        const comConsultas = profissionais.body.find((item) => item.email === "profissional@demo.com");
        const resposta = await api().delete(`/api/profissionais/${comConsultas.id}`).set(como("admin"));
        assert.equal(resposta.status, 409);
        assert.match(resposta.body.mensagem, /desative/);
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
        const resposta = await api().put("/api/configuracoes").set(como("recepcao")).send({ antecedenciaLembreteHoras: 48 });
        assert.equal(resposta.body.antecedenciaLembreteHoras, 48);
    });
});

describe("perfil do usuário logado", () => {
    it("atualiza o próprio nome e troca a senha", async () => {
        const atualizado = await api().put("/api/auth/me").set(como("recepcao")).send({ nome: "Rafaela Costa Lima" });
        assert.equal(atualizado.status, 200);
        assert.equal(atualizado.body.nome, "Rafaela Costa Lima");

        const errada = await api().patch("/api/auth/senha").set(como("recepcao")).send({ senhaAtual: "x", novaSenha: "nova-senha" });
        assert.equal(errada.status, 401);
        const certa = await api().patch("/api/auth/senha").set(como("recepcao")).send({ senhaAtual: "123456", novaSenha: "nova-senha" });
        assert.equal(certa.status, 200);
        const login = await api().post("/api/auth/login").send({ email: "recepcao@demo.com", senha: "nova-senha" });
        assert.equal(login.status, 200);
    });
});

describe("atualizações de dados do setup", () => {
    it("completa 2 médicos por especialidade uma única vez", async () => {
        const { aplicarAtualizacoes, ESPECIALIDADES } = require("../src/seed/catalogo");
        const Profissional = require("../src/models/Profissional");
        const Especialidade = require("../src/models/Especialidade");

        const primeira = await aplicarAtualizacoes({ senha: "123456" });
        assert.equal(primeira.length, 2);
        const { CONVENIOS } = require("../src/seed/catalogo");
        const Convenio = require("../src/models/Convenio");
        for (const nome of CONVENIOS) assert.ok(await Convenio.exists({ nome }), nome);
        for (const item of ESPECIALIDADES) {
            assert.ok(await Especialidade.exists({ nome: item.nome }), item.nome);
        }
        for (const especialidade of await Especialidade.find({ ativo: true })) {
            const ativos = await Profissional.countDocuments({ especialidade: especialidade.nome, ativo: true });
            assert.ok(ativos >= 2, `${especialidade.nome} tem ${ativos} médico(s)`);
        }
        const login = await api().post("/api/auth/login").send({ email: "eduardo.rocha@senai.org.br", senha: "123456" });
        assert.equal(login.status, 200);

        const total = await Profissional.countDocuments();
        await Profissional.deleteOne({ email: "eduardo.rocha@senai.org.br" });
        assert.deepEqual(await aplicarAtualizacoes({ senha: "123456" }), []);
        assert.equal(await Profissional.countDocuments(), total - 1);
    });
});

describe("documentos do médico", () => {
    it("envia atestado só para o paciente escolhido", async () => {
        const eu = await api().get("/api/auth/me").set(como("paciente"));
        const documento = await api()
            .post("/api/notificacoes")
            .set(como("profissional"))
            .send({ titulo: "Atestado médico", texto: "Atesto para os devidos fins.", publico: ["paciente"], paciente: eu.body.paciente, acao: "documento" });
        assert.equal(documento.status, 201);

        const avisos = await api().get("/api/notificacoes").set(como("paciente"));
        assert.ok(avisos.body.some((item) => item.titulo === "Atestado médico" && item.acao === "documento"));

        const paraTodos = await api().post("/api/notificacoes").set(como("profissional")).send({ titulo: "Oi", texto: "Para todos", publico: ["paciente"] });
        assert.equal(paraTodos.status, 400);
    });
});
