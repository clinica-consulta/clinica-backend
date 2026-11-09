// Modelo visual dos e-mails da clínica: cabeçalho com a logo, mensagem, quadro de detalhes,
// botão de ação e rodapé com o contato. Feito com tabelas e estilos em linha, como os
// programas de e-mail (Gmail, Outlook) exigem. Sempre acompanha a versão em texto puro.

const urlDoSite = () => (process.env.FRONTEND_URL || (process.env.CORS_ORIGIN || "").split(",")[0] || "").trim().replace(/\/+$/, "");

const CORES = { fundo: "#f2f5fa", cartao: "#ffffff", marca: "#1f3349", texto: "#1b2633", suave: "#5b6b7d", borda: "#e3e8ef", destaque: "#eef3f9" };

const escapar = (valor) =>
    String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

/**
 * Monta o e-mail nas duas versões.
 * @param {object} dados
 * @param {string} dados.titulo        Título no topo do cartão.
 * @param {string} dados.nome          Nome de quem recebe (saudação).
 * @param {string} dados.mensagem      Parágrafo principal.
 * @param {{rotulo: string, valor: string}[]} [dados.detalhes]  Quadro de detalhes (consulta, valores...).
 * @param {{texto: string, link: string}} [dados.botao]          Botão de ação.
 * @param {string} [dados.observacao]  Texto menor depois do botão.
 * @param {{nome: string, telefone?: string, email?: string}} dados.clinica
 * @param {string} [dados.destaque]    Código ou valor em destaque (ex.: código de redefinição).
 */
const montarEmail = ({ titulo, nome, mensagem, detalhes = [], botao, observacao = "", clinica, destaque = "" }) => {
    const site = urlDoSite();
    const logo = site ? `${site}/email/logo.png` : "";
    const contato = [clinica.telefone, clinica.email].filter(Boolean).join(" · ");

    const linhasDetalhes = detalhes
        .map(
            ({ rotulo, valor }) =>
                `<tr><td style="padding:6px 0;color:${CORES.suave};font-size:13px;width:38%;vertical-align:top">${escapar(rotulo)}</td>` +
                `<td style="padding:6px 0;color:${CORES.texto};font-size:14px;font-weight:600">${escapar(valor)}</td></tr>`
        )
        .join("");

    const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:0;background:${CORES.fundo};font-family:Arial,Helvetica,sans-serif;color:${CORES.texto}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CORES.fundo};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:8px 0 20px">
${logo ? `<img src="${logo}" width="64" alt="${escapar(clinica.nome)}" style="display:block;border:0;width:64px;height:auto">` : ""}
<div style="margin-top:8px;font-size:15px;font-weight:700;letter-spacing:.5px;color:${CORES.marca}">${escapar(clinica.nome)}</div>
</td></tr>
<tr><td style="background:${CORES.cartao};border:1px solid ${CORES.borda};border-radius:14px;padding:28px 28px 24px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:${CORES.marca}">${escapar(titulo)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:22px">Olá, ${escapar(nome)}!</p>
<p style="margin:0 0 20px;font-size:15px;line-height:22px">${escapar(mensagem)}</p>
${destaque ? `<div style="margin:0 0 20px;padding:14px;border-radius:10px;background:${CORES.destaque};text-align:center;font-size:28px;font-weight:700;letter-spacing:6px;color:${CORES.marca}">${escapar(destaque)}</div>` : ""}
${linhasDetalhes ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;padding:12px 16px;border-radius:10px;background:${CORES.destaque}">${linhasDetalhes}</table>` : ""}
${botao?.link ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="border-radius:10px;background:${CORES.marca}"><a href="${escapar(botao.link)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${escapar(botao.texto)}</a></td></tr></table>` : ""}
${observacao ? `<p style="margin:0;font-size:13px;line-height:20px;color:${CORES.suave}">${escapar(observacao)}</p>` : ""}
</td></tr>
<tr><td align="center" style="padding:18px 8px 0;font-size:12px;line-height:18px;color:${CORES.suave}">
Equipe ${escapar(clinica.nome)}${contato ? `<br>${escapar(contato)}` : ""}<br>Este é um e-mail automático; para falar com a clínica, use os contatos acima.
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

    const texto =
        `Olá, ${nome}!\n\n${mensagem}\n\n` +
        (destaque ? `${destaque}\n\n` : "") +
        (detalhes.length ? `${detalhes.map(({ rotulo, valor }) => `• ${rotulo}: ${valor}`).join("\n")}\n\n` : "") +
        (botao?.link ? `${botao.texto}:\n${botao.link}\n\n` : "") +
        (observacao ? `${observacao}\n\n` : "") +
        `Equipe ${clinica.nome}` +
        (contato ? `\n${contato}` : "");

    return { html, texto };
};

module.exports = { montarEmail, urlDoSite };
