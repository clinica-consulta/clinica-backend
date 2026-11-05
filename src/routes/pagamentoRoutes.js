const { Router } = require("express");
const Consulta = require("../models/Consulta");
const mercadoPago = require("../services/mercadoPagoService");
const { sincronizarComMercadoPago } = require("../services/pagamentoService");

const rotas = Router();

// Webhook do Mercado Pago (público). O corpo só diz qual pagamento mudou:
// a situação real é sempre consultada na API do Mercado Pago com o token da clínica.
rotas.post("/webhook", async (req, res) => {
    const tipo = req.body?.type || req.query.type || req.query.topic;
    const id = req.body?.data?.id || req.query["data.id"] || req.query.id;

    if (!mercadoPago.configurado() || tipo !== "payment" || !id) return res.sendStatus(200);
    if (!mercadoPago.assinaturaValida(req, String(id))) return res.sendStatus(401);

    try {
        const pagamento = await mercadoPago.buscarPagamento(id);
        const consulta = pagamento.external_reference ? await Consulta.findById(pagamento.external_reference).catch(() => null) : null;
        if (consulta) await sincronizarComMercadoPago(consulta, pagamento);
        res.sendStatus(200);
    } catch (erro) {
        // Resposta de erro faz o Mercado Pago tentar de novo mais tarde.
        console.error("Falha ao processar webhook do Mercado Pago:", erro.message);
        res.sendStatus(500);
    }
});

// Informa ao site se o pagamento on-line está ativo (e se está em modo de teste).
rotas.get("/config", (_req, res) => {
    res.json({ gateway: mercadoPago.configurado() ? "Mercado Pago" : null, teste: mercadoPago.modoTeste() });
});

module.exports = rotas;
