// Deixa só os números do CPF.
const digitos = (valor) => String(valor ?? "").replace(/\D/g, "");

// Confere os dois dígitos verificadores.
const cpfValido = (valor) => {
    const d = digitos(valor);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const digito = (tamanho) => {
        let soma = 0;
        for (let i = 0; i < tamanho; i += 1) soma += Number(d[i]) * (tamanho + 1 - i);
        const resto = (soma * 10) % 11;
        return resto === 10 ? 0 : resto;
    };
    return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
};

// Sempre grava no formato 000.000.000-00.
const formatarCpf = (valor) => {
    const d = digitos(valor);
    return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : String(valor ?? "").trim();
};

module.exports = { cpfValido, formatarCpf };
