# Clínica Médica - API Backend

> **Projeto Integrador - SENAI**
> API para gestão de consultas, agendamentos e controle de pacientes em clínicas médicas.

---

## Objetivo
Centralizar a marcação de consultas, organizar a agenda médica e enviar lembretes aos pacientes para reduzir faltas.

## Tecnologias
- **Node.js** (20 ou superior) + **Express 5**
- **MongoDB** com **Mongoose**
- **JWT** para login e **bcryptjs** para as senhas
- Testes com **node:test** + **supertest**

Front-end que consome esta API: [clinic-harmony](https://github.com/mocotoTonin/clinic-harmony).

## Como rodar

```bash
# 1. Instalar as dependências
npm install

# 2. Criar o arquivo de configuração
cp .env.example .env        # no Windows: copy .env.example .env

# 3. Ajustar o MONGODB_URI no .env (local ou Atlas, veja abaixo)

# 4. Cadastrar a clínica e os acessos reais (veja "Dados reais" abaixo)
npm run setup -- --limpar   # --limpar APAGA tudo antes; tire para só acrescentar

# 5. Subir a API
npm run dev                 # com recarga automática (nodemon)
# ou
npm start
```

A API sobe em `http://localhost:3000` e as rotas ficam em `http://localhost:3000/api`.

### MongoDB local ou Atlas

No `.env`, use **um** dos dois:

```env
# MongoDB instalado na sua máquina
MONGODB_URI=mongodb://127.0.0.1:27017/gestao-consultas

# MongoDB Atlas (Connect > Drivers no painel do Atlas)
MONGODB_URI=mongodb+srv://USUARIO:SENHA@SEU-CLUSTER.mongodb.net/gestao-consultas?retryWrites=true&w=majority
```

No Atlas, libere o seu IP em **Network Access**. O `.env` nunca vai para o GitHub (está no `.gitignore`).

### Dados reais (uso de verdade)

1. Copie `dados-iniciais.example.json` para `dados-iniciais.json` e preencha com os dados da clínica, as especialidades, os convênios e as pessoas reais (administradores, recepção e profissionais).
   O `dados-iniciais.json` está no `.gitignore` e não vai para o GitHub.
2. Rode `npm run setup -- --limpar` para apagar os dados de teste e criar tudo do arquivo.
   Depois, `npm run setup` (sem `--limpar`) só acrescenta e atualiza, sem mexer nas senhas de quem já existe.
3. Quem não tiver `"senha"` no arquivo entra com a `SENHA_PADRAO` do `.env` e troca a senha clicando no próprio nome, no topo do site.

Pacientes não entram no arquivo: eles se cadastram pela tela "Cadastre-se" ou são cadastrados pela recepção.
Sem o arquivo, o setup cria só o administrador definido no `.env` (`ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA`).

### Dados de demonstração

`npm run seed:demo` **apaga o banco** e cria dados fictícios com os logins `recepcao@demo.com`, `paciente@demo.com`, `profissional@demo.com` e `admin@demo.com` (senha `123456`). Use só para testar.

### Testes

```bash
npm test
```

Os testes usam o banco `gestao-consultas-teste` em `mongodb://127.0.0.1:27017` (troque com `MONGODB_URI_TESTE`), então não apagam seus dados.

## Rotas

Todas as rotas (exceto as marcadas como públicas) exigem o cabeçalho `Authorization: Bearer <token>`, recebido no login.

| Método | Rota | Quem pode | Descrição |
|---|---|---|---|
| POST | `/api/auth/login` | público | Login com `email` e `senha` |
| POST | `/api/auth/cadastro` | público | Cadastro de paciente (já devolve o token) |
| POST | `/api/auth/recuperar-senha` | público | Gera token de redefinição (exibido no console da API) |
| POST | `/api/auth/redefinir-senha` | público | Troca a senha com o token |
| GET | `/api/auth/me` | logado | Usuário logado |
| PUT | `/api/auth/me` | logado | Atualizar o próprio nome e telefone |
| PATCH | `/api/auth/senha` | logado | Alterar a própria senha |
| GET | `/api/pacientes` | logado | Paciente vê só o próprio cadastro |
| POST | `/api/pacientes` | recepção, admin | Cadastrar paciente |
| PUT | `/api/pacientes/:id` | recepção, admin, o próprio paciente | Editar |
| PATCH | `/api/pacientes/:id/status` | recepção, admin | Ativar/desativar |
| GET | `/api/profissionais` | logado | Listar (filtros `especialidade`, `ativo`) |
| POST | `/api/profissionais` | admin | Cadastrar médico |
| PUT | `/api/profissionais/:id` | admin, o próprio médico (contato) | Editar |
| PATCH | `/api/profissionais/:id/status` | admin | Ativar/desativar |
| PUT | `/api/profissionais/:id/disponibilidade/:dia` | admin | Expediente do dia (0=domingo … 6=sábado) |
| GET/POST/DELETE | `/api/bloqueios` | logado / recepção, admin | Bloqueios de agenda |
| GET | `/api/consultas` | logado | Filtros `data`, `dataInicio`, `dataFim`, `profissional`, `paciente`, `status`, `especialidade` |
| GET | `/api/consultas/horarios?profissional=&data=` | logado | Horários livres |
| GET | `/api/consultas/elegibilidade?paciente=&especialidade=` | logado | Verifica convênio/cadastro |
| POST | `/api/consultas` | recepção, admin, paciente | Agendar |
| PATCH | `/api/consultas/:id/status` | conforme o perfil | Confirmar, cancelar, realizada, não compareceu |
| PATCH | `/api/consultas/:id/remarcar` | recepção, admin, paciente | Remarcar |
| POST | `/api/consultas/:id/lembrete` | recepção, admin | Enviar lembrete |
| POST | `/api/consultas/lembretes` | recepção, admin | Lembrete para todas as pendentes |
| GET/POST/PATCH/DELETE | `/api/fila-espera` | recepção, admin | Fila de espera (`/:id/convidar`) |
| GET | `/api/notificacoes` | logado | Avisos do perfil (`?naoLidas=true`) |
| POST | `/api/notificacoes` | recepção, admin, profissional | Enviar aviso |
| PATCH | `/api/notificacoes/:id/lida`, `/api/notificacoes/lidas` | logado | Marcar como lida |
| GET | `/api/especialidades`, `/api/convenios` | público | Listar |
| POST/PUT/PATCH | `/api/especialidades`, `/api/convenios` | admin | Gerenciar (`/:id/status`) |
| GET/PUT | `/api/configuracoes` | logado / recepção, admin | Dados e preferências da clínica |
| GET/POST/PUT/PATCH | `/api/usuarios` | admin | Equipe interna (recepção e administradores) |
| GET | `/api/relatorios/resumo` | recepção, admin | Indicadores do painel |

### Regras de negócio principais
- Horários de 30 em 30 minutos dentro do expediente do médico, sem consultas ativas e sem bloqueios.
- O agendamento só acontece se o paciente estiver ativo, a especialidade ativa e coberta pelo convênio.
- Cancelar libera o horário; remarcar volta a consulta para "Sem resposta" de confirmação.
- Toda alteração fica no histórico da consulta.
- Desativar paciente, médico ou especialidade preserva o histórico e bloqueia o acesso/novos agendamentos.

## Estrutura

```
src/
├── app.js              # Express: middlewares e rotas
├── server.js           # Conecta no MongoDB e sobe o servidor
├── config/             # Conexão e padrão de JSON do Mongoose
├── controllers/        # Regras de cada recurso
├── middlewares/        # Autenticação (JWT), permissões e erros
├── models/             # Schemas do MongoDB
├── routes/             # Rotas da API (/api/...)
├── services/           # Agenda (horários/elegibilidade) e notificações
├── seed/               # Setup com dados reais (npm run setup) e demonstração (npm run seed:demo)
└── utils/              # Datas, textos e erros
tests/                  # Testes de integração
```

## Fluxo de trabalho (Git Flow)

- `main`: versão estável (cada entrega recebe uma tag, ex.: `v1.0.0`)
- `develop`: integração do que está pronto
- `feature/nome-da-funcionalidade`: cada funcionalidade nasce do `develop` e volta para ele com merge
- `release/x.y.z`: preparação de uma versão, que vai para `main` e `develop`
- `hotfix/descricao`: correção urgente a partir da `main`

Mensagens de commit seguem o padrão `tipo: descrição` (`feat`, `fix`, `docs`, `test`, `chore`).
