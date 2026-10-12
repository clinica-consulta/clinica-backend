const iniciais = (nome = "") => {
    const partes = nome.trim().split(/\s+/).filter((parte) => parte.length > 2);
    const fonte = partes.length ? partes : nome.trim().split(/\s+/);
    return `${fonte[0]?.[0] ?? ""}${fonte[fonte.length - 1]?.[0] ?? ""}`.toUpperCase();
};

// Copia só os campos permitidos que vieram no corpo da requisição.
const escolherCampos = (origem = {}, campos = []) =>
    campos.reduce((resultado, campo) => {
        if (origem[campo] !== undefined) resultado[campo] = origem[campo];
        return resultado;
    }, {});

module.exports = { iniciais, escolherCampos };
