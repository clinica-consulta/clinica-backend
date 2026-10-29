const Usuario = require("../models/Usuario");
const Profissional = require("../models/Profissional");
const Especialidade = require("../models/Especialidade");
const Configuracao = require("../models/Configuracao");

// Atualizações do corpo clínico aplicadas pelo setup, uma única vez por banco.
// Depois de aplicada, fica registrada na configuração da clínica e não roda de novo,
// para não recriar médicos ou especialidades que o administrador excluiu ou desativou pelo site.

const manha = { ativo: true, inicio: "08:00", fim: "12:00" };
const tarde = { ativo: true, inicio: "13:00", fim: "18:00" };
const integral = { ativo: true, inicio: "08:00", fim: "17:00" };
const folga = { ativo: false, inicio: "08:00", fim: "12:00" };

// Chaves 0 (domingo) a 6 (sábado). Os dois médicos de cada especialidade se revezam entre manhã e tarde.
const turnoManha = { 1: manha, 2: integral, 3: manha, 4: integral, 5: manha, 6: folga };
const turnoTarde = { 1: tarde, 2: integral, 3: tarde, 4: integral, 5: tarde, 6: folga };

const CORES = ["bg-primary", "bg-info", "bg-success", "bg-warning"];

const ESPECIALIDADES = [
    {
        nome: "Clínica geral",
        medicos: [
            { nome: "Dra. Fernanda Lopes", crm: "CRM-SP 123457", telefone: "(11) 98888-2301" },
            { nome: "Dr. Ricardo Alves", crm: "CRM-SP 123458", telefone: "(11) 98888-2302" }
        ]
    },
    {
        nome: "Cardiologia",
        medicos: [
            { nome: "Dra. Ana Martins", crm: "CRM-SP 184520", telefone: "(11) 98888-2303" },
            { nome: "Dr. Eduardo Rocha", crm: "CRM-SP 184521", telefone: "(11) 98888-2304" }
        ]
    },
    {
        nome: "Pediatria",
        medicos: [
            { nome: "Dra. Juliana Ferraz", crm: "CRM-SP 201330", telefone: "(11) 98888-2305" },
            { nome: "Dr. Marcos Pereira", crm: "CRM-SP 201331", telefone: "(11) 98888-2306" }
        ]
    },
    {
        nome: "Dermatologia",
        medicos: [
            { nome: "Dra. Lívia Prado", crm: "CRM-SP 201140", telefone: "(11) 98888-2307" },
            { nome: "Dr. Gustavo Ramos", crm: "CRM-SP 201141", telefone: "(11) 98888-2308" }
        ]
    },
    {
        nome: "Ortopedia",
        medicos: [
            { nome: "Dr. Rafael Teixeira", crm: "CRM-SP 175610", telefone: "(11) 98888-2309" },
            { nome: "Dra. Camila Nogueira", crm: "CRM-SP 175611", telefone: "(11) 98888-2310" }
        ]
    },
    {
        nome: "Ginecologia",
        medicos: [
            { nome: "Dra. Beatriz Carvalho", crm: "CRM-SP 162280", telefone: "(11) 98888-2311" },
            { nome: "Dra. Patrícia Gomes", crm: "CRM-SP 162281", telefone: "(11) 98888-2312" }
        ]
    },
    {
        nome: "Oftalmologia",
        medicos: [
            { nome: "Dr. Henrique Costa", crm: "CRM-SP 158900", telefone: "(11) 98888-2313" },
            { nome: "Dra. Larissa Moura", crm: "CRM-SP 158901", telefone: "(11) 98888-2314" }
        ]
    },
    {
        nome: "Neurologia",
        medicos: [
            { nome: "Dr. Felipe Azevedo", crm: "CRM-SP 149730", telefone: "(11) 98888-2315" },
            { nome: "Dra. Renata Barbosa", crm: "CRM-SP 149731", telefone: "(11) 98888-2316" }
        ]
    },
    {
        nome: "Psiquiatria",
        medicos: [
            { nome: "Dra. Mariana Lima", crm: "CRM-SP 193450", telefone: "(11) 98888-2317" },
            { nome: "Dr. André Santos", crm: "CRM-SP 193451", telefone: "(11) 98888-2318" }
        ]
    },
    {
        nome: "Endocrinologia",
        medicos: [
            { nome: "Dra. Paula Ribeiro", crm: "CRM-SP 187060", telefone: "(11) 98888-2319" },
            { nome: "Dr. Thiago Martins", crm: "CRM-SP 187061", telefone: "(11) 98888-2320" }
        ]
    },
    {
        nome: "Otorrinolaringologia",
        medicos: [
            { nome: "Dr. Bruno Cardoso", crm: "CRM-SP 166720", telefone: "(11) 98888-2321" },
            { nome: "Dra. Sabrina Freitas", crm: "CRM-SP 166721", telefone: "(11) 98888-2322" }
        ]
    },
    {
        nome: "Urologia",
        medicos: [
            { nome: "Dr. Leonardo Vieira", crm: "CRM-SP 171890", telefone: "(11) 98888-2323" },
            { nome: "Dr. Daniel Moreira", crm: "CRM-SP 171891", telefone: "(11) 98888-2324" }
        ]
    }
];

// Para especialidades criadas pelo site que não estão na lista acima.
const RESERVA = [
    { nome: "Dra. Helena Duarte", crm: "CRM-SP 210010", telefone: "(11) 98888-2401" },
    { nome: "Dr. Vinícius Melo", crm: "CRM-SP 210011", telefone: "(11) 98888-2402" },
    { nome: "Dra. Aline Castro", crm: "CRM-SP 210012", telefone: "(11) 98888-2403" },
    { nome: "Dr. Rodrigo Pires", crm: "CRM-SP 210013", telefone: "(11) 98888-2404" },
    { nome: "Dra. Natália Campos", crm: "CRM-SP 210014", telefone: "(11) 98888-2405" },
    { nome: "Dr. Fábio Cunha", crm: "CRM-SP 210015", telefone: "(11) 98888-2406" },
    { nome: "Dra. Vanessa Rezende", crm: "CRM-SP 210016", telefone: "(11) 98888-2407" },
    { nome: "Dr. Samuel Fonseca", crm: "CRM-SP 210017", telefone: "(11) 98888-2408" }
];

const MEDICOS_POR_ESPECIALIDADE = 2;

// "Dra. Lívia Prado" -> "livia.prado@senai.org.br"
const emailDe = (nome) => {
    const partes = nome
        .replace(/^dra?\.?\s+/i, "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/\s+/);
    return `${partes[0]}.${partes[partes.length - 1]}@senai.org.br`;
};

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mesmoNome = (nome) => new RegExp(`^${escaparRegex(nome)}$`, "i");

// Cria o médico e o acesso dele (senha padrão). Se o nome ou o e-mail já existem, não mexe em nada.
const criarMedico = async (dados, especialidade, indice, senha) => {
    const email = emailDe(dados.nome);
    if (await Profissional.exists({ $or: [{ email }, { nome: mesmoNome(dados.nome) }] })) return null;
    if (await Usuario.exists({ email })) return null;
    const profissional = await Profissional.create({
        ...dados,
        email,
        especialidade,
        cor: CORES[indice % CORES.length],
        disponibilidade: indice % 2 ? turnoTarde : turnoManha
    });
    await Usuario.create({
        nome: profissional.nome,
        email,
        telefone: profissional.telefone,
        senha,
        tipo: "profissional",
        profissional: profissional._id
    });
    return profissional;
};

// Completa cada especialidade com 2 médicos ativos, contando os que já existem.
const ampliarCorpoClinico = async ({ senha }) => {
    const resumo = { especialidades: [], medicos: [] };
    let indice = 0;

    for (const item of ESPECIALIDADES) {
        const existente = await Especialidade.findOne({ nome: mesmoNome(item.nome) });
        if (!existente) {
            await Especialidade.create({ nome: item.nome, ativo: true });
            resumo.especialidades.push(item.nome);
        }
    }

    const reserva = [...RESERVA];
    const especialidades = await Especialidade.find({ ativo: true }).sort({ nome: 1 });
    for (const especialidade of especialidades) {
        const doCatalogo = ESPECIALIDADES.find((item) => item.nome.toLowerCase() === especialidade.nome.toLowerCase());
        const candidatos = doCatalogo ? [...doCatalogo.medicos] : reserva;
        let ativos = await Profissional.countDocuments({ especialidade: mesmoNome(especialidade.nome), ativo: true });
        while (ativos < MEDICOS_POR_ESPECIALIDADE && candidatos.length) {
            const criado = await criarMedico(candidatos.shift(), especialidade.nome, indice, senha);
            indice += 1;
            if (criado) {
                ativos += 1;
                resumo.medicos.push(`${criado.nome} (${especialidade.nome})`);
            }
        }
    }
    return resumo;
};

// Lista de atualizações em ordem. Para acrescentar dados no futuro, adicione um item com um id novo.
const ATUALIZACOES = [{ id: "2026-10-corpo-clinico", descricao: "Novas especialidades e 2 médicos por especialidade", executar: ampliarCorpoClinico }];

const aplicarAtualizacoes = async ({ senha }) => {
    const configuracao = await Configuracao.obter();
    const feitas = new Set(configuracao.atualizacoes ?? []);
    const relatorio = [];
    for (const atualizacao of ATUALIZACOES) {
        if (feitas.has(atualizacao.id)) continue;
        const resumo = await atualizacao.executar({ senha });
        await Configuracao.updateOne({ _id: configuracao._id }, { $addToSet: { atualizacoes: atualizacao.id } });
        relatorio.push({ ...atualizacao, resumo });
    }
    return relatorio;
};

module.exports = { aplicarAtualizacoes, ESPECIALIDADES, emailDe };
