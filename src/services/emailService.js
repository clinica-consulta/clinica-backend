const nodemailer = require("nodemailer");

// Envia e-mail quando o SMTP está configurado no .env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM).
// Sem SMTP, nada é enviado e quem chamou decide o que fazer (no setup local, o código aparece na tela).
const smtpConfigurado = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const enviarEmail = async ({ para, assunto, texto }) => {
    if (!smtpConfigurado()) return false;
    const porta = Number(process.env.SMTP_PORT || 587);
    const transporte = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: porta,
        secure: porta === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await transporte.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: para, subject: assunto, text: texto });
    return true;
};

module.exports = { enviarEmail, smtpConfigurado };
