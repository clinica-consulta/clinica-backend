# Guia de desenvolvimento

Instruções técnicas para rodar, testar e publicar a API. A documentação do projeto está no [README](../README.md).

## Como rodar

Precisa do Node.js 20+ e do MongoDB rodando na máquina (o mesmo que aparece no MongoDB Compass em `mongodb://127.0.0.1:27017`).

```bash
npm install
npm run setup     # cria o .env e o banco "clinica-senai"; pede a senha do administrador
npm run dev       # sobe a API em http://localhost:3000 (com recarga automática)
```

Na primeira vez, o `npm run setup` cria sozinho o `.env` na raiz, com um segredo aleatório para os logins. Ele nunca vai para o GitHub. Para mudar algo, edite esse arquivo:

| Variável | Padrão |
|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/clinica-senai` (troque pelo endereço do Atlas, se for usar) |
| `PORT` | `3000` |
| `JWT_SECRET` | gerado aleatoriamente pelo setup |
| `CORS_ORIGIN` | vazio (libera qualquer origem) |
| `SENHA_PADRAO` | `123456` (senha inicial de quem é cadastrado pela equipe) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | vazios. Preencha para o código de redefinição de senha ir por e-mail; sem eles, o código aparece na tela e no terminal da API |
| `BREVO_API_KEY`, `EMAIL_REMETENTE`, `EMAIL_NOME` | vazios. Alternativa ao SMTP que envia pela API do Brevo (HTTPS); use no Render grátis. Tem prioridade sobre o SMTP |
| `STRIPE_SECRET_KEY` | vazio. Chave secreta do Stripe (`sk_test_...` ou chave restrita `rk_test_...`). Sem ela, o pagamento do paciente é simulado |
| `STRIPE_PUBLISHABLE_KEY` | vazio. Chave publicável do Stripe (`pk_test_...`), enviada ao site para exibir o formulário de pagamento |
| `STRIPE_WEBHOOK_SECRET` | vazio. Segredo de assinatura do webhook (`whsec_...`). Obrigatório para confirmar Pix e boleto |
| `FRONTEND_URL` | vazio (usa o primeiro endereço de `CORS_ORIGIN`). Endereço do site, usado no retorno de métodos com redirecionamento e no e-mail de cobrança |

### Banco e acessos iniciais

`npm run setup` cria a **Clínica Senai** (dados fictícios), as especialidades Clínica geral, Cardiologia e Pediatria, os convênios Particular e Unimed, e três acessos:

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `marco@senai.org.br` | a que você digitar no terminal durante o setup |
| Recepção | `recepcao@senai.org.br` | `123456` |
| Profissional | `carlos.mendes@senai.org.br` | `123456` |

O setup também monta o corpo clínico: 12 especialidades (Clínica geral, Cardiologia, Pediatria, Dermatologia, Ortopedia, Ginecologia, Oftalmologia, Neurologia, Psiquiatria, Endocrinologia, Otorrinolaringologia e Urologia) com 2 médicos ativos em cada uma. Os médicos entram com o e-mail `nome.sobrenome@senai.org.br` (por exemplo `ana.martins@senai.org.br`) e a senha `123456`. A lista fica em `src/seed/catalogo.js`.

Todo o resto é cadastrado **pelo site**: o administrador cria médicos, recepcionistas, especialidades e convênios, e os pacientes se cadastram em "Cadastre-se" (ou pela recepção). Cada pessoa troca a própria senha clicando no nome, no topo do site.

`npm run setup -- --limpar` **apaga o banco inteiro** e cria tudo de novo. Em um banco já configurado, `npm run setup` mantém acessos e configurações e só aplica as atualizações de dados que ainda não rodaram naquele banco (cada uma roda uma única vez, então médicos excluídos pelo site não voltam); use `npm run setup -- --forcar` para recriar os acessos iniciais que faltarem.

### Testes

```bash
npm test
```

Os testes usam o banco `gestao-consultas-teste` em `mongodb://127.0.0.1:27017` (troque com `MONGODB_URI_TESTE`), então não apagam seus dados.

## Deploy no Render

O arquivo `render.yaml` já descreve o serviço. No Render: **New > Blueprint**, escolha este repositório e preencha:

- `MONGODB_URI`: endereço do MongoDB Atlas, terminando em `/clinica-senai`
- `ADMIN_SENHA`: senha do administrador (marco@senai.org.br) criada no primeiro deploy
- `CORS_ORIGIN`: endereço do front na Vercel, por exemplo `https://gestao-consultas.vercel.app`

`JWT_SECRET` é gerado pelo Render. No primeiro início, `npm run setup` cria a clínica e os acessos iniciais. Nos próximos, ele vê que o banco já está configurado e só aplica as atualizações de dados novas (como o corpo clínico de `src/seed/catalogo.js`), uma única vez.
### Pagamento com Stripe (modo de teste)

O paciente paga dentro do site, no Checkout embutido do Stripe, com as formas de pagamento ativas na conta (Pix, cartão, boleto, carteiras digitais).

1. Crie uma conta em [stripe.com](https://dashboard.stripe.com/register) com país **Brasil** (necessário para Pix e boleto) e deixe o painel em **modo de teste**.
2. Em **Configurações → Formas de pagamento**, ative **Pix**, **Cartões** e **Boleto**. Algumas contas precisam solicitar o acesso ao Pix.
3. Em **Desenvolvedores → Chaves de API**, copie a **chave publicável** (`pk_test_...`) e a **chave secreta** (`sk_test_...`). Preencha `STRIPE_PUBLISHABLE_KEY` e `STRIPE_SECRET_KEY` no Render.
4. Em **Desenvolvedores → Webhooks**, adicione o endpoint `https://<sua-api>.onrender.com/api/pagamentos/webhook` com os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`. Copie o **segredo de assinatura** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET`.
5. Para testar com cartão, use `4242 4242 4242 4242`, qualquer validade futura e qualquer CVC. No Pix de teste, o Stripe mostra um botão para simular o pagamento.

Nenhum valor é cobrado com chaves de teste. Para cobrar de verdade, ative a conta e troque pelas chaves de produção (`pk_live_` e `sk_live_`).

O plano grátis do Render bloqueia envio de e-mail por SMTP. Para o código de redefinição chegar por e-mail, use o Brevo: crie uma chave de API, verifique o e-mail remetente no Brevo e preencha `BREVO_API_KEY` e `EMAIL_REMETENTE` no Render. Sem isso, o código aparece na tela.

