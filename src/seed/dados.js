const { dataISO: dia } = require("../utils/datas");

// Mesmos dados de demonstração usados no protótipo do front-end.
// Datas são relativas a hoje para a agenda sempre ter movimento.

const semanaPadrao = {
    1: { ativo: true, inicio: "08:00", fim: "17:00" },
    2: { ativo: true, inicio: "08:00", fim: "17:00" },
    3: { ativo: true, inicio: "13:00", fim: "18:00" },
    4: { ativo: true, inicio: "08:00", fim: "17:00" },
    5: { ativo: true, inicio: "08:00", fim: "16:00" },
    6: { ativo: false, inicio: "08:00", fim: "12:00" }
};

const especialidades = [
    { nome: "Cardiologia" },
    { nome: "Clínica geral" },
    { nome: "Dermatologia" }
];

const convenios = [
    { nome: "Particular", coberturas: [] },
    { nome: "Saúde Total", coberturas: ["Cardiologia", "Clínica geral"] },
    { nome: "VidaMais", coberturas: ["Clínica geral", "Dermatologia"] }
];

const pacientes = [
    { chave: "p1", nome: "Marina Costa", cpf: "123.456.789-09", telefone: "(11) 99842-1034", email: "paciente@demo.com", dataNascimento: "1992-04-12", convenio: "Saúde Total" },
    { chave: "p2", nome: "Roberto Lima", cpf: "234.567.890-92", telefone: "(11) 97118-5220", email: "roberto@email.com", dataNascimento: "1985-09-03", convenio: "VidaMais" },
    { chave: "p3", nome: "Camila Duarte", cpf: "345.678.901-75", telefone: "(11) 98720-4102", email: "camila@email.com", dataNascimento: "1990-01-27", convenio: "Particular" },
    { chave: "p4", nome: "João Pedro Reis", cpf: "456.789.012-49", telefone: "(11) 96544-9091", email: "joao@email.com", dataNascimento: "1978-06-15", convenio: "VidaMais" },
    { chave: "p5", nome: "Beatriz Souza", cpf: "567.890.123-03", telefone: "(11) 99940-2377", email: "beatriz@email.com", dataNascimento: "1999-11-08", convenio: "Particular", status: "Inativo" },
    { chave: "p6", nome: "Sofia Almeida", cpf: "678.901.234-69", telefone: "(11) 98111-7742", email: "sofia@email.com", dataNascimento: "1996-02-19", convenio: "Saúde Total" },
    { chave: "p7", nome: "Carlos Mendes", cpf: "789.012.345-05", telefone: "(11) 97402-3388", email: "carlos@email.com", dataNascimento: "1971-08-30", convenio: "Particular" }
];

const profissionais = [
    { chave: "pro1", nome: "Dra. Ana Martins", especialidade: "Cardiologia", crm: "CRM 18452", telefone: "(11) 99210-1845", email: "profissional@demo.com", cor: "bg-primary", disponibilidade: semanaPadrao },
    { chave: "pro2", nome: "Dr. Paulo Nunes", especialidade: "Clínica geral", crm: "CRM 23018", telefone: "(11) 99820-2301", email: "paulo@clinicavita.com.br", cor: "bg-info", disponibilidade: semanaPadrao },
    { chave: "pro3", nome: "Dra. Lívia Prado", especialidade: "Dermatologia", crm: "CRM 20114", telefone: "(11) 99733-2011", email: "livia@clinicavita.com.br", cor: "bg-warning", disponibilidade: semanaPadrao }
];

const equipe = [
    { nome: "Rafaela Costa", email: "recepcao@demo.com", tipo: "recepcionista", telefone: "(11) 99912-8400" },
    { nome: "Marcelo Andrade", email: "admin@demo.com", tipo: "administrador" },
    { nome: "Tiago Barros", email: "tiago@clinicavita.com.br", tipo: "recepcionista", status: "Pendente" }
];

const r = (texto, em) => ({ texto, em });

const consultas = [
    { codigo: "1048", data: dia(0), hora: "08:00", paciente: "p1", profissional: "pro1", status: "Confirmada", observacoes: "Retorno de exames", canal: "Paciente", lembreteEnviadoEm: dia(-1), respostaConfirmacao: "Confirmou", historico: [r("Consulta criada pelo paciente", dia(-3)), r("Paciente confirmou presença", dia(-1))] },
    { codigo: "1049", data: dia(0), hora: "09:00", paciente: "p2", profissional: "pro2", status: "Confirmada", canal: "Recepção", lembreteEnviadoEm: dia(-1), respostaConfirmacao: "Confirmou", historico: [r("Consulta criada pela recepção", dia(-4))] },
    { codigo: "1050", data: dia(0), hora: "10:30", paciente: "p3", profissional: "pro1", status: "Agendada", canal: "Recepção", historico: [r("Consulta criada pela recepção", dia(-2))] },
    { codigo: "1051", data: dia(0), hora: "13:00", paciente: "p4", profissional: "pro3", status: "Confirmada", canal: "Paciente", lembreteEnviadoEm: dia(-1), respostaConfirmacao: "Confirmou", historico: [r("Consulta criada pelo paciente", dia(-5))] },
    { codigo: "1052", data: dia(1), hora: "14:30", paciente: "p5", profissional: "pro2", status: "Agendada", canal: "Recepção", historico: [r("Consulta criada pela recepção", dia(-1))] },
    { codigo: "1053", data: dia(2), hora: "09:30", paciente: "p1", profissional: "pro3", status: "Confirmada", observacoes: "Avaliação de pele", canal: "Paciente", respostaConfirmacao: "Confirmou", historico: [r("Consulta criada pelo paciente", dia(-1))] },
    { codigo: "1040", data: dia(-6), hora: "08:30", paciente: "p1", profissional: "pro1", status: "Realizada", canal: "Paciente", lembreteEnviadoEm: dia(-7), respostaConfirmacao: "Confirmou", historico: [r("Atendimento realizado", dia(-6))] },
    { codigo: "1041", data: dia(-6), hora: "10:00", paciente: "p3", profissional: "pro2", status: "Não compareceu", canal: "Recepção", lembreteEnviadoEm: dia(-7), historico: [r("Ausência registrada", dia(-6))] },
    { codigo: "1042", data: dia(-5), hora: "11:00", paciente: "p4", profissional: "pro1", status: "Realizada", canal: "Recepção", lembreteEnviadoEm: dia(-6), respostaConfirmacao: "Confirmou", historico: [r("Atendimento realizado", dia(-5))] },
    { codigo: "1043", data: dia(-4), hora: "15:00", paciente: "p2", profissional: "pro3", status: "Realizada", canal: "Paciente", lembreteEnviadoEm: dia(-5), respostaConfirmacao: "Confirmou", historico: [r("Atendimento realizado", dia(-4))] },
    { codigo: "1044", data: dia(-3), hora: "16:00", paciente: "p5", profissional: "pro2", status: "Cancelada", canal: "Paciente", respostaConfirmacao: "Cancelou", historico: [r("Consulta cancelada pelo paciente", dia(-4))] },
    { codigo: "1045", data: dia(-2), hora: "08:00", paciente: "p6", profissional: "pro1", status: "Realizada", canal: "Recepção", lembreteEnviadoEm: dia(-3), respostaConfirmacao: "Confirmou", historico: [r("Atendimento realizado", dia(-2))] }
];

const bloqueios = [
    { profissional: "pro2", dataInicio: dia(3), dataFim: dia(3), horaInicio: "08:00", horaFim: "12:00", motivo: "Reunião clínica" }
];

const filaEspera = [
    { paciente: "p6", especialidade: "Cardiologia", preferencia: "Manhã", entradaEm: dia(-2), prioridade: "Alta" },
    { paciente: "p7", especialidade: "Clínica geral", preferencia: "Qualquer horário", entradaEm: dia(-1), prioridade: "Normal" },
    { paciente: "p5", especialidade: "Dermatologia", preferencia: "Tarde", entradaEm: dia(0), prioridade: "Normal" }
];

const notificacoes = [
    { titulo: "Consulta confirmada", texto: "Cardiologia com Dra. Ana Martins às 08:00.", publico: ["paciente"], paciente: "p1" },
    { titulo: "Lembrete de consulta", texto: "Confirme sua presença na consulta desta semana.", publico: ["paciente"], paciente: "p1" },
    { titulo: "Agenda do dia", texto: "Você tem atendimentos confirmados para hoje.", publico: ["profissional"] },
    { titulo: "Confirmações pendentes", texto: "Existem consultas sem confirmação nas próximas 24 horas.", publico: ["recepcionista", "administrador"] },
    { titulo: "Ocupação da agenda", texto: "Cardiologia está próxima do limite de horários.", publico: ["administrador"] }
];

const configuracao = {
    nome: "Clínica Vita",
    cnpj: "12.345.678/0001-90",
    telefone: "(11) 3000-2026",
    email: "contato@clinicavita.com.br",
    antecedenciaLembreteHoras: 24,
    confirmacaoAutomatica: false
};

module.exports = {
    especialidades,
    convenios,
    pacientes,
    profissionais,
    equipe,
    consultas,
    bloqueios,
    filaEspera,
    notificacoes,
    configuracao
};
