const Paciente = require("../models/Paciente");
const Configuracao = require("../models/Configuracao");
const { dataISO, formatarDataBR } = require("../utils/datas");
const { notificar } = require("./notificacaoService");
const { enviarEmail } = require("./emailService");
const mercadoPago = require("./mercadoPagoService");

const formatarValor = (valor) => Number(valor ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Gera (ou reaproveita) o link de pagamento do Mercado Pago para a consulta.
// Devolve null quando o Mercado Pago não está configurado.
const garantirLinkDePagamento = async (consulta, { novo = false } = {}) => {
    if (!mercadoPago.configurado()) return null;
    if (consulta.pagamento?.linkPagamento && !novo) return consulta.pagamento.linkPagamento;

    const [paciente, configuracao] = await Promise.all([Paciente.findById(consulta.paciente), Configuracao.obter()]);
    const cobranca = await mercadoPago.criarCobranca({
        consulta,
        paciente,
        valor: consulta.pagamento.valor,
        nomeClinica: configuracao.nome
    });
    consulta.pagamento.gateway = "Mercado Pago";
    consulta.pagamento.preferenciaId = cobranca.preferenciaId;
    consulta.pagamento.linkPagamento = cobranca.url;
    await consulta.save();
    return cobranca.url;
};

// Avisa o paciente (no portal e por e-mail, se configurado) que a cobrança da consulta está disponível.
const avisarCobranca = async (consulta) => {
    const quando = `${formatarDataBR(consulta.data)} às ${consulta.hora}`;
    const valor = formatarValor(consulta.pagamento.valor);

    let link = null;
    try {
        link = await garantirLinkDePagamento(consulta);
    } catch (erro) {
        // Sem o link agora, o paciente ainda gera a cobrança pelo portal ao clicar em "Pagar".
        console.error("Não foi possível criar a cobrança no Mercado Pago:", erro.message);
    }

    await notificar({
        titulo: "Pagamento da consulta disponível",
        texto: `Sua consulta de ${quando} foi concluída. O pagamento de ${valor} já está disponível: pague com Pix ou cartão pelo portal.`,
        publico: ["paciente"],
        paciente: consulta.paciente,
        consulta: consulta._id,
        acao: "pagamento"
    });

    const paciente = await Paciente.findById(consulta.paciente);
    if (!paciente?.email) return;
    const portal = mercadoPago.urlDoSite() ? `${mercadoPago.urlDoSite()}/paciente` : "";
    const caminho = link || portal;
    await enviarEmail({
        para: paciente.email,
        assunto: `Pagamento da consulta #${consulta.codigo} disponível`,
        texto:
            `Olá, ${paciente.nome}!\n\n` +
            `Sua consulta de ${consulta.especialidade} em ${quando} foi concluída.\n` +
            `O pagamento de ${valor} já está disponível.\n\n` +
            (caminho ? `Pague com Pix, cartão de crédito ou débito em:\n${caminho}\n\n` : "Acesse o portal do paciente para pagar.\n\n") +
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

// Consulta o Mercado Pago e confirma a consulta se houver pagamento aprovado.
// Aceita um pagamento já buscado (webhook) ou procura pela referência da consulta.
const sincronizarComMercadoPago = async (consulta, pagamento = null) => {
    if (!mercadoPago.configurado() || consulta.pagamento?.status !== "Pendente") return consulta;

    const candidatos = pagamento ? [pagamento] : await mercadoPago.pagamentosDaConsulta(consulta._id);
    const daConsulta = candidatos.filter((item) => String(item.external_reference) === String(consulta._id));
    const aprovado = daConsulta.find((item) => item.status === "approved");

    if (aprovado) {
        // Não aceita pagamento com valor menor que o cobrado.
        if (Number(aprovado.transaction_amount) + 0.001 < Number(consulta.pagamento.valor)) {
            console.error(`Pagamento ${aprovado.id} com valor menor que o cobrado na consulta ${consulta.codigo}`);
            return consulta;
        }
        await confirmarPagamento(consulta, {
            metodo: mercadoPago.metodoDoPagamento(aprovado),
            codigo: `MP-${aprovado.id}`,
            gateway: "Mercado Pago",
            transacaoId: String(aprovado.id),
            situacaoGateway: aprovado.status
        });
    } else if (daConsulta[0] && consulta.pagamento.situacaoGateway !== daConsulta[0].status) {
        consulta.pagamento.transacaoId = String(daConsulta[0].id);
        consulta.pagamento.situacaoGateway = daConsulta[0].status;
        await consulta.save();
    }
    return consulta;
};

module.exports = { formatarValor, garantirLinkDePagamento, avisarCobranca, confirmarPagamento, sincronizarComMercadoPago };
