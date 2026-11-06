const Paciente = require("../models/Paciente");
const Configuracao = require("../models/Configuracao");
const { dataISO, formatarDataBR } = require("../utils/datas");
const { notificar } = require("./notificacaoService");
const { enviarEmail } = require("./emailService");
const stripe = require("./stripeService");

const formatarValor = (valor) => Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const urlDoSite = () => (process.env.FRONTEND_URL || (process.env.CORS_ORIGIN || "").split(",")[0] || "").trim().replace(/\/+$/, "");

// Avisa o paciente (no portal e por e-mail, se configurado) que o pagamento da consulta está disponível.
const avisarCobranca = async (consulta) => {
    const quando = `${formatarDataBR(consulta.data)} às ${consulta.hora}`;
    const valor = formatarValor(consulta.pagamento.valor);

    await notificar({
        titulo: "Pagamento da consulta disponível",
        texto: `Sua consulta de ${quando} foi concluída. O pagamento de ${valor} já está disponível: pague com Pix ou cartão aqui no portal.`,
        publico: ["paciente"],
        paciente: consulta.paciente,
        consulta: consulta._id,
        acao: "pagamento"
    });

    const paciente = await Paciente.findById(consulta.paciente);
    if (!paciente?.email) return;
    const portal = urlDoSite() ? `${urlDoSite()}/paciente` : "";
    await enviarEmail({
        para: paciente.email,
        assunto: `Pagamento da consulta #${consulta.codigo} disponível`,
        texto:
            `Olá, ${paciente.nome}!\n\n` +
            `Sua consulta de ${consulta.especialidade} em ${quando} foi concluída.\n` +
            `O pagamento de ${valor} já está disponível.\n\n` +
            (portal ? `Pague com Pix ou cartão no portal do paciente:\n${portal}\n\n` : "Acesse o portal do paciente para pagar.\n\n") +
            "Se você já pagou, desconsidere esta mensagem."
    }).catch((erro) => console.error("Falha ao enviar e-mail de cobrança:", erro.message));
};

// Marca a consulta como paga e avisa paciente e recepção. Não faz nada se já estiver paga.
const confirmarPagamento = async (consulta, { metodo, codigo, gateway, transacaoId = "", situacaoGateway = "" }) => {
    if (consulta.pagamento?.status === "Pago") return false;

    consulta.pagamento.status = "Pago";
    consulta.pagamento.metodo = metodo;
    consulta.pagamento.codigo = codigo;
    consulta.pagamento.gateway = gateway;
    consulta.pagamento.transacaoId = transacaoId;
    consulta.pagamento.situacaoGateway = situacaoGateway;
    consulta.pagamento.pagoEm = new Date();
    consulta.historico.push({ em: dataISO(), texto: `Pagamento de ${formatarValor(consulta.pagamento.valor)} via ${metodo} (${gateway})` });
    await consulta.save();

    const paciente = await Paciente.findById(consulta.paciente);
    await notificar({
        titulo: "Pagamento recebido",
        texto: `${paciente?.nome ?? "Paciente"} pagou ${formatarValor(consulta.pagamento.valor)} via ${metodo} (consulta #${consulta.codigo}).`,
        publico: ["recepcionista", "administrador"]
    });
    await notificar({
        titulo: "Pagamento confirmado",
        texto: `Recebemos ${formatarValor(consulta.pagamento.valor)} via ${metodo}. Comprovante: ${codigo}.`,
        publico: ["paciente"],
        paciente: consulta.paciente,
        consulta: consulta._id
    });
    return true;
};

// Confere a sessão de pagamento no Stripe e confirma a consulta se o pagamento foi aprovado.
// Pix e boleto são confirmados depois: a sessão fica "complete" com pagamento "unpaid" até o dinheiro cair.
const sincronizarComStripe = async (consulta, idDaSessao = null) => {
    if (!stripe.configurado() || consulta.pagamento?.status !== "Pendente") return consulta;
    const id = idDaSessao || consulta.pagamento.sessaoId;
    if (!id) return consulta;

    // Sempre busca no Stripe: não confia no que veio de fora.
    const sessao = await stripe.buscarSessao(id);
    if (sessao.metadata?.consulta !== String(consulta._id)) return consulta;

    if (sessao.payment_status === "paid") {
        // Não aceita pagamento com valor menor que o cobrado.
        if (Number(sessao.amount_total) < stripe.centavos(consulta.pagamento.valor)) {
            console.error(`Sessão ${sessao.id} com valor menor que o cobrado na consulta ${consulta.codigo}`);
            return consulta;
        }
        const intencao = typeof sessao.payment_intent === "string" ? sessao.payment_intent : sessao.payment_intent?.id;
        await confirmarPagamento(consulta, {
            metodo: stripe.metodoDaSessao(sessao),
            codigo: `ST-${String(intencao || sessao.id).slice(-10).toUpperCase()}`,
            gateway: "Stripe",
            transacaoId: intencao || sessao.id,
            situacaoGateway: "paid"
        });
    } else {
        const situacao = sessao.status === "complete" ? "aguardando confirmação" : sessao.status;
        if (consulta.pagamento.situacaoGateway !== situacao) {
            consulta.pagamento.situacaoGateway = situacao;
            await consulta.save();
        }
    }
    return consulta;
};

// Devolve o client_secret de uma sessão de pagamento aberta, reaproveitando a anterior quando possível.
const abrirSessao = async (consulta) => {
    if (consulta.pagamento.sessaoId) {
        const anterior = await stripe.buscarSessao(consulta.pagamento.sessaoId);
        if (anterior.status === "complete") {
            await sincronizarComStripe(consulta, anterior.id);
            return { sessao: anterior, jaPago: consulta.pagamento.status === "Pago", aguardando: anterior.payment_status !== "paid" };
        }
        if (anterior.status === "open" && anterior.amount_total === stripe.centavos(consulta.pagamento.valor) && anterior.client_secret) {
            return { sessao: anterior };
        }
    }

    const [paciente, configuracao] = await Promise.all([Paciente.findById(consulta.paciente), Configuracao.obter()]);
    const sessao = await stripe.criarSessao({
        consulta,
        paciente,
        valor: consulta.pagamento.valor,
        nomeClinica: configuracao.nome,
        urlDoSite: urlDoSite()
    });
    consulta.pagamento.gateway = "Stripe";
    consulta.pagamento.sessaoId = sessao.id;
    consulta.pagamento.situacaoGateway = sessao.status;
    await consulta.save();
    return { sessao };
};

module.exports = { formatarValor, avisarCobranca, confirmarPagamento, sincronizarComStripe, abrirSessao };
