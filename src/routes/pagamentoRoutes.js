const express = require("express");
const Consulta = require("../models/Consulta");
const stripe = require("../services/stripeService");
const { sincronizarComStripe } = require("../services/pagamentoService");

const rotas = express.Router();

const EVENTOS = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"];

// Webhook do Stripe (público). Precisa do corpo cru para conferir a assinatura (STRIPE_WEBHOOK_SECRET).
// Mesmo com assinatura válida, a sessão é sempre consultada de novo na API do Stripe.
const webhook = async (req, res) => {
    if (!stripe.configurado() || !process.env.STRIPE_WEBHOOK_SECRET) return res.sendStatus(503);

    let evento;
    try {
        evento = stripe.lerEventoDoWebhook(req.body, req.headers["stripe-signature"]);
    } catch (erro) {
        return res.status(400).send(`Assinatura inválida: ${erro.message}`);
    }
    if (!EVENTOS.includes(evento.type)) return res.json({ recebido: true });

    try {
        const sessao = evento.data.object;
        const id = sessao.metadata?.consulta || sessao.client_reference_id;
        const consulta = id ? await Consulta.findById(id).catch(() => null) : null;
        if (consulta) await sincronizarComStripe(consulta, sessao.id);
        res.json({ recebido: true });
    } catch (erro) {
        // Resposta de erro faz o Stripe tentar de novo mais tarde.
        console.error("Falha ao processar webhook do Stripe:", erro.message);
        res.sendStatus(500);
    }
};

// Informa ao site se o pagamento on-line está ativo.
rotas.get("/config", (_req, res) => {
    res.json({ gateway: stripe.configurado() ? "Stripe" : null, teste: stripe.modoTeste() });
});

module.exports = rotas;
module.exports.webhook = webhook;
