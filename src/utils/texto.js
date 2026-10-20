// Ignora títulos como "Dr." e "Dra." (Dra. Ana Martins -> AM).
const iniciais = (nome = "") => {
    const limpo = nome.trim().replace(/^dra?\.?\s+/i, "");
    const partes = limpo.split(/\s+/).filter((parte) => parte.length > 2);
    const fonte = partes.length ? partes : limpo.split(/\s+/);
    return `${fonte[0]?.[0] ?? ""}${fonte[fonte.length - 1]?.[0] ?? ""}`.toUpperCase();
};

// Copia só os campos permitidos que vieram no corpo da requisição.
const escolherCampos = (origem = {}, campos = []) =>
    campos.reduce((resultado, campo) => {
        if (origem[campo] !== undefined) resultado[campo] = origem[campo];
        return resultado;
    }, {});

module.exports = { iniciais, escolherCampos };
