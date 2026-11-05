const crypto = require("node:crypto");

// Integração com o Mercado Pago (Checkout Pro): o paciente paga com Pix, cartão de crédito
// ou débito numa página do próprio Mercado Pago e a API confirma o pagamento consultando o gateway.
// Com credenciais de teste (contas de teste do Mercado Pago) nenhum valor é cobrado de verdade.
const API = "https://api.mercadopago.com";

const configurado = () => Boolean(process.env.MP_ACCESS_TOKEN);
const modoTeste = () => (process.env.MP_ACCESS_TOKEN || "").startsWith("TEST-");

const semBarraFinal = (url) => (url || "").replace(/\/+$/, "");
const urlDoSite = () => semBarraFinal(process.env.FRONTEND_URL || (process.env.CORS_ORIGIN || "").split(",")[0]?.trim());
// No Render a variável RENDER_EXTERNAL_URL já vem preenchida com o endereço público da API.
const urlDaApi = () => semBarraFinal(process.env.API_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL);
const ehHttps = (url) => /^https:\/\//.test(url);

class ErroGateway extends Error {}

const chamar = async (metodo, caminho, corpo, cabecalhos = {}) => {
    let resposta;
    try {
        resposta = await fetch(`${API}${caminho}`, {
            method: metodo,
            headers: {
                Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
                ...(corpo !== undefined && { "Content-Type": "application/json" }),
                ...cabecalhos
            },
            body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
            signal: AbortSignal.timeout(15000)
        });
    } catch (erro) {
        throw new ErroGateway(`Mercado Pago indisponível: ${erro.message}`);
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
        throw new ErroGateway(`Mercado Pago recusou a requisição (${resposta.status}): ${dados.message || dados.error || "erro desconhecido"}`);
    }
    return dados;
};

// Cria a cobrança (preferência) da consulta e devolve o link de pagamento.
const criarCobranca = async ({ consulta, paciente, valor, nomeClinica }) => {
    const site = urlDoSite();
    const api = urlDaApi();
    const retorno = (situacao) => `${site}/paciente?pagamento=${situacao}&consulta=${consulta._id}`;

    const preferencia = await chamar(
        "POST",
        "/checkout/preferences",
        {
            items: [
                {
                    id: String(consulta.codigo),
                    title: `Consulta de ${consulta.especialidade} (#${consulta.codigo})`,
                    description: `${nomeClinica} - consulta de ${consulta.data} às ${consulta.hora}`,
                    category_id: "services",
                    quantity: 1,
                    currency_id: "BRL",
                    unit_price: Number(valor)
                }
            ],
            payer: paciente ? { name: paciente.nome, email: paciente.email } : undefined,
            external_reference: String(consulta._id),
            statement_descriptor: (nomeClinica || "CLINICA").slice(0, 13),
            payment_methods: { installments: 1 },
            ...(site && { back_urls: { success: retorno("aprovado"), pending: retorno("pendente"), failure: retorno("recusado") } }),
            // O Mercado Pago só aceita retorno automático e webhook em endereços públicos (https).
            ...(ehHttps(site) && { auto_return: "approved" }),
            ...(ehHttps(api) && { notification_url: `${api}/api/pagamentos/webhook` })
        },
        { "X-Idempotency-Key": `consulta-${consulta._id}-${Date.now()}` }
    );

    return {
        preferenciaId: preferencia.id,
        url: modoTeste() ? preferencia.sandbox_init_point || preferencia.init_point : preferencia.init_point
    };
};

const buscarPagamento = (id) => chamar("GET", `/v1/payments/${encodeURIComponent(id)}`);

// Pagamentos já feitos para a consulta (mais recentes primeiro).
const pagamentosDaConsulta = async (consultaId) => {
    const resultado = await chamar(
        "GET",
        `/v1/payments/search?external_reference=${encodeURIComponent(String(consultaId))}&sort=date_created&criteria=desc`
    );
    return resultado.results ?? [];
};

const METODOS = { pix: "Pix", bank_transfer: "Pix", credit_card: "Cartão de crédito", debit_card: "Cartão de débito", account_money: "Saldo Mercado Pago", ticket: "Boleto" };
const metodoDoPagamento = (pagamento) => METODOS[pagamento.payment_method_id] || METODOS[pagamento.payment_type_id] || "Mercado Pago";

// Confere a assinatura do webhook (x-signature) quando MP_WEBHOOK_SECRET está definido.
// Mesmo sem segredo, o webhook nunca confia no corpo: o pagamento é sempre consultado na API do Mercado Pago.
const assinaturaValida = (req, idDoRecurso) => {
    const segredo = process.env.MP_WEBHOOK_SECRET;
    if (!segredo) return true;
    const partes = Object.fromEntries(
        String(req.headers["x-signature"] || "")
            .split(",")
            .map((parte) => parte.split("=").map((valor) => valor.trim()))
    );
    if (!partes.ts || !partes.v1) return false;
    const id = /^[a-z0-9]+$/i.test(idDoRecurso) ? String(idDoRecurso).toLowerCase() : idDoRecurso;
    let manifesto = `id:${id};`;
    if (req.headers["x-request-id"]) manifesto += `request-id:${req.headers["x-request-id"]};`;
    manifesto += `ts:${partes.ts};`;
    const esperado = crypto.createHmac("sha256", segredo).update(manifesto).digest("hex");
    const a = Buffer.from(esperado);
    const b = Buffer.from(String(partes.v1));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {
    configurado,
    modoTeste,
    criarCobranca,
    buscarPagamento,
    pagamentosDaConsulta,
    metodoDoPagamento,
    assinaturaValida,
    urlDoSite,
    ErroGateway
};
