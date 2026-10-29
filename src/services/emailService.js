const nodemailer = require("nodemailer");

// Envia e-mail de dois jeitos, conforme o .env:
//   BREVO_API_KEY + EMAIL_REMETENTE -> API do Brevo por HTTPS (funciona no Render grátis, que bloqueia SMTP)
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM -> SMTP (por exemplo Gmail, para rodar no computador)
// Sem nenhum dos dois, nada é enviado e quem chamou decide o que fazer (o código aparece na tela).
const brevoConfigurado = () => Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_REMETENTE);
const smtpConfigurado = () => brevoConfigurado() || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const enviarPeloBrevo = async ({ para, assunto, texto }) => {
    const resposta = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
            sender: { name: process.env.EMAIL_NOME || "Clínica Senai", email: process.env.EMAIL_REMETENTE },
            to: [{ email: para }],
            subject: assunto,
            textContent: texto
        }),
        // Sem resposta em 10 s, desiste e mostra o código na tela.
        signal: AbortSignal.timeout(10000)
    });
    if (!resposta.ok) throw new Error(`Brevo respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`);
};

const enviarPorSmtp = async ({ para, assunto, texto }) => {
    const porta = Number(process.env.SMTP_PORT || 587);
    const transporte = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: porta,
        secure: porta === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // Sem resposta do servidor de e-mail em 10 s, desiste e mostra o código na tela.
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    });
    await transporte.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: para, subject: assunto, text: texto });
};

const enviarEmail = async (mensagem) => {
    if (brevoConfigurado()) {
        await enviarPeloBrevo(mensagem);
        return true;
    }
    if (!smtpConfigurado()) return false;
    await enviarPorSmtp(mensagem);
    return true;
};

module.exports = { enviarEmail, smtpConfigurado };
