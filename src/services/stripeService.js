const crypto = require("node:crypto");
const StripeSDK = require("stripe");

const Stripe = StripeSDK.default || StripeSDK;

// Integração com o Stripe (Checkout embutido): o formulário de pagamento do Stripe aparece dentro
// do site, com todas as formas de pagamento ativas na conta (Pix, cartão, boleto, carteiras digitais...).
// Com chaves de teste (sk_test_ / pk_test_) nenhum valor é cobrado de verdade.
const configurado = () => Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);
const modoTeste = () => /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || "");
const chavePublica = () => process.env.STRIPE_PUBLISHABLE_KEY || "";

let cliente = null;
let chaveDoCliente = null;
let clienteDeTeste = null;
const stripe = () => {
    if (clienteDeTeste) return clienteDeTeste;
    if (cliente && chaveDoCliente === process.env.STRIPE_SECRET_KEY) return cliente;
    cliente = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 20000 });
    chaveDoCliente = process.env.STRIPE_SECRET_KEY;
    return cliente;
};

// Só para os testes automáticos: troca o cliente do Stripe por um simulado (null volta ao real).
const usarClienteDeTeste = (falso) => {
    clienteDeTeste = falso;
};

class ErroGateway extends Error {}

const chamar = async (acao) => {
    try {
        return await acao();
    } catch (erro) {
        throw new ErroGateway(`Stripe: ${erro.message}`);
    }
};

const centavos = (valor) => Math.round(Number(valor) * 100);
const sufixoAleatorio = () =>
    Array.from(crypto.randomBytes(8), (byte) => String.fromCharCode(97 + (byte % 26))).join("");

// Cria a sessão de pagamento da consulta. O valor é sempre definido aqui no servidor.
const criarSessao = ({ consulta, paciente, valor, nomeClinica, urlDoSite }) =>
    chamar(() =>
        stripe().checkout.sessions.create(
            {
                ui_mode: "embedded_page",
                mode: "payment",
                line_items: [
                    {
                        quantity: 1,
                        price_data: {
                            currency: "brl",
                            unit_amount: centavos(valor),
                            product_data: {
                                name: `Consulta de ${consulta.especialidade} (#${consulta.codigo})`,
                                description: `${nomeClinica} - ${consulta.data} às ${consulta.hora}`
                            }
                        }
                    }
                ],
                customer_email: paciente?.email || undefined,
                client_reference_id: String(consulta._id),
                metadata: { consulta: String(consulta._id), codigo: String(consulta.codigo) },
                payment_intent_data: { metadata: { consulta: String(consulta._id), codigo: String(consulta.codigo) } },
                // Fica no site: só sai dele se o paciente escolher um método que exige redirecionamento.
                redirect_on_completion: "if_required",
                return_url: `${urlDoSite}/paciente?pagamento=retorno&consulta=${consulta._id}&sessao={CHECKOUT_SESSION_ID}`,
                integration_identifier: `consulta-${sufixoAleatorio()}`
            },
            { idempotencyKey: `consulta-${consulta._id}-${Date.now()}` }
        )
    );

const buscarSessao = (id) => chamar(() => stripe().checkout.sessions.retrieve(id, { expand: ["payment_intent.latest_charge"] }));

const METODOS = {
    card: "Cartão",
    pix: "Pix",
    boleto: "Boleto",
    link: "Link (Stripe)",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay"
};

// Descobre como o paciente pagou (ex.: Pix, Cartão de crédito).
const metodoDaSessao = (sessao) => {
    const detalhes = sessao.payment_intent?.latest_charge?.payment_method_details;
    const tipo = detalhes?.type;
    if (tipo === "card") {
        const carteira = detalhes.card?.wallet?.type;
        if (carteira && METODOS[carteira]) return METODOS[carteira];
        if (detalhes.card?.funding === "credit") return "Cartão de crédito";
        if (detalhes.card?.funding === "debit") return "Cartão de débito";
        return "Cartão";
    }
    return METODOS[tipo] || "Stripe";
};

// Confere a assinatura do webhook com STRIPE_WEBHOOK_SECRET. Exige o corpo cru (Buffer).
const lerEventoDoWebhook = (corpoCru, assinatura) =>
    stripe().webhooks.constructEvent(corpoCru, assinatura, process.env.STRIPE_WEBHOOK_SECRET);

module.exports = {
    configurado,
    modoTeste,
    chavePublica,
    criarSessao,
    buscarSessao,
    metodoDaSessao,
    lerEventoDoWebhook,
    usarClienteDeTeste,
    centavos,
    ErroGateway
};
