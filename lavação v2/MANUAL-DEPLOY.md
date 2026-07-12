# Manual de Deploy — Centro de Controle ABF Lavacar

Este manual assume zero configuração prévia. Ao final, o sistema estará no ar, com login real, dado real, o Motor de Oportunidades rodando sozinho e o Copiloto respondendo perguntas.

**Tempo estimado:** 40-60 minutos na primeira vez.

---

## 0. O que você vai precisar antes de começar

- Conta no [Supabase](https://supabase.com) (grátis pra começar).
- Conta no [Netlify](https://netlify.com) (grátis pra começar).
- Conta no [Groq](https://console.groq.com) (grátis, é a API que roda o Copiloto).
- Os arquivos deste projeto: `centro-de-controle-abf.html`, a pasta `services/`, a pasta `netlify/`, `netlify.toml`, `package.json` e `sql/schema.sql`.

---

## 1. Criar o projeto no Supabase

1. Entre em [supabase.com](https://supabase.com) → **New project**.
2. Nome do projeto: `ponte-digital` (ou o que preferir).
3. Escolha uma senha forte de banco e guarde — só pede uma vez.
4. Região: a mais perto do Brasil disponível (`South America (São Paulo)`, se aparecer).
5. Aguarde o projeto provisionar (1-2 minutos).

## 2. Rodar o schema (todas as tabelas de uma vez)

1. No painel do Supabase, vá em **SQL Editor** → **New query**.
2. Abra o arquivo `sql/schema.sql` deste projeto, copie tudo e cole no editor.
3. Clique em **Run**.
4. Confira em **Table Editor** se as tabelas apareceram: `empresas`, `clientes`, `atendimentos`, `financeiro`, `insights`, etc. — devem ser 15 tabelas no total.
5. Confira em **Storage** se o bucket `logos` foi criado — o schema já cria ele e as policies de upload/leitura junto (usado na tela Configurações → Trocar logo).

O script já cria a empresa `ABF Lavacar`, a configuração inicial (meta R$ 1.500/dia) e o catálogo de serviços. Falta só o usuário do Agnaldo (próximo passo).

## 3. Criar o primeiro usuário (login do Agnaldo)

1. No Supabase, vá em **Authentication → Users → Add user**.
2. Preencha o e-mail e senha que o Agnaldo vai usar pra entrar no sistema. Marque **Auto Confirm User**.
3. Copie o **UUID** desse usuário que acabou de aparecer na lista (é a coluna `UID`).
4. Volte no **SQL Editor** e rode (trocando o e-mail pelo que você usou):

```sql
insert into usuarios (empresa_id, auth_user_id, nome, email, papel)
select e.id, u.id, 'Agnaldo', 'AGNALDO@EMAIL-QUE-VOCE-USOU.com', 'dono'
from empresas e, auth.users u
where e.slug = 'abf-lavacar' and u.email = 'AGNALDO@EMAIL-QUE-VOCE-USOU.com';
```

5. Confira: `select * from usuarios;` deve trazer uma linha com o `papel = 'dono'`.

## 4. Pegar as chaves do Supabase

Em **Project Settings → API**, anote três valores — vão ser usados nos próximos passos:

| Nome no painel | Onde vai ser usado |
|---|---|
| **Project URL** | front-end (`centro-de-controle-abf.html`) e Netlify Functions |
| **anon public key** | front-end |
| **service_role key** | Netlify Functions (nunca no front-end!) |

A `service_role key` ignora toda a RLS — por isso ela só pode existir em variável de ambiente do servidor (Netlify), nunca em código que vai pro navegador.

## 5. Configurar o front-end com o projeto real

1. Abra `centro-de-controle-abf.html` num editor de texto.
2. Procure por `PONTE_DIGITAL_CONFIG` perto do topo do arquivo.
3. Preencha:

```js
window.PONTE_DIGITAL_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA_ANON_KEY_AQUI',
};
```

4. Salve. A partir daqui, ao abrir o arquivo, ele vai pedir login em vez de mostrar dado fictício.

> Se deixar os dois campos em branco, o sistema continua funcionando 100% em modo demo (dado fictício) — útil pra continuar apresentando pra outros clientes potenciais sem misturar com dado real da ABF.

## 6. Publicar no Netlify

### Opção A — arrastar e soltar (mais simples, sem Functions ainda)

1. Entre em [app.netlify.com](https://app.netlify.com) → **Add new site → Deploy manually**.
2. Arraste a pasta inteira do projeto (com `centro-de-controle-abf.html` dentro).
3. Netlify publica e dá uma URL tipo `nome-aleatorio.netlify.app`.

Isso já deixa o painel no ar com login funcionando — mas **o Copiloto (IA) e o Motor de Oportunidades automático não funcionam ainda**, porque dependem das Netlify Functions (próxima seção).

### Opção B — via Git (recomendado, habilita as Functions automaticamente)

1. Suba os arquivos pra um repositório no GitHub (`services/`, `netlify/`, `netlify.toml`, `package.json`, `centro-de-controle-abf.html`, `sql/`).
2. No Netlify: **Add new site → Import an existing project** → conecte o GitHub → escolha o repositório.
3. Build settings: pode deixar em branco (o `netlify.toml` já define `publish = "."` e `functions = "netlify/functions"`).
4. Clique em **Deploy**.

## 7. Configurar as variáveis de ambiente (obrigatório para o Copiloto funcionar)

No Netlify: **Site settings → Environment variables → Add a variable**. Adicione as três:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | a mesma Project URL do passo 4 |
| `SUPABASE_SERVICE_ROLE_KEY` | a service_role key do passo 4 |
| `GROQ_API_KEY` | sua chave da Groq (veja passo 8) |

Depois de adicionar, vá em **Deploys → Trigger deploy → Deploy site** pra aplicar.

## 8. Criar a chave da Groq

1. Entre em [console.groq.com](https://console.groq.com) → **API Keys → Create API Key**.
2. Copie a chave (só aparece uma vez) e cole em `GROQ_API_KEY` no Netlify (passo 7).
3. O modelo usado por padrão no `copiloto.js` é `llama-3.3-70b-versatile` — gratuito no plano free da Groq, dentro dos limites de uso deles.

## 9. Renomear o arquivo principal (opcional, mas recomendado)

Se quiser que o site abra direto no painel (sem digitar o nome do arquivo na URL), renomeie `centro-de-controle-abf.html` para `index.html` antes de publicar.

## 10. Testar, na ordem

1. Acesse a URL do Netlify. Deve aparecer a tela de **login** (não mais o mock).
2. Entre com o e-mail/senha criados no passo 3.
3. O painel deve abrir mostrando os dados reais (vazios ou com o pouco que o `seed` do schema criou — normal, ainda não tem cliente/atendimento cadastrado).
4. Teste o Copiloto: no painel, vá em **Consultora IA** → pergunte algo. Se der erro 401/403, revise o passo 3 (usuário sem vínculo em `usuarios`). Se der erro 502, revise a `GROQ_API_KEY`.
5. Teste o Motor de Oportunidades manualmente antes de esperar o cron: acesse `https://SEU-SITE.netlify.app/.netlify/functions/rodar-motor-oportunidades` direto no navegador. Deve responder `200 Motor de Oportunidades executado com sucesso.`. Confira em **Table Editor → insights** no Supabase se algo foi gravado (só grava se alguma condição bater — ex: meta abaixo de 70%).

## 11. Cadastrar dado real pela primeira vez

O schema já vem com os serviços da ABF (`Lavagem simples`, `Lavagem completa`, `Higienização`, `Polimento`) e as categorias financeiras. Falta cadastrar:

- **Clientes**: pelo botão "Novo cliente" no painel (a v1 do formulário ainda precisa ser ligada ao `clienteService.criar()` — está pronto no código, é questão de conectar o botão).
- Alternativa mais rápida pra começar a testar: inserir alguns clientes direto pelo **Table Editor** do Supabase, na tabela `clientes`, preenchendo `empresa_id` com o UUID da ABF (`select id from empresas where slug = 'abf-lavacar';`).

## 12. Checklist final antes de considerar "no ar de verdade"

- [ ] Login funciona com o e-mail do Agnaldo.
- [ ] RLS está ativa em todas as tabelas (rode `select tablename, rowsecurity from pg_tables where schemaname='public';` no SQL Editor — todas devem estar `true`).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` está **só** nas variáveis de ambiente do Netlify — nunca commitada em nenhum arquivo do repositório.
- [ ] Copiloto responde a uma pergunta de teste.
- [ ] Motor de Oportunidades já rodou pelo menos uma vez (manual ou via cron) e a tabela `insights` tem alguma linha.
- [ ] Domínio próprio configurado (opcional): **Site settings → Domain management** no Netlify, se a Ponte Digital tiver um domínio pra apontar (ex: `app.pontedigital.com.br`).

---

## O que ainda é manual nesta v1 (próximos passos de desenvolvimento, não de deploy)

- **Novo cliente, Nova lavagem, Registrar pagamento, Editar empresa, Editar meta diária e Trocar logo já gravam de verdade** — funcionam nos dois modos: em modo demo, atualizam só a tela (ou, no caso da logo, fazem preview local); com o Supabase configurado, gravam nas tabelas reais (`clientes`, `atendimentos`, `financeiro`, `empresas`, `configuracoes_empresa`) e no bucket `logos` do Storage.
- **WhatsApp e Editar cadastro de cliente** ainda são `alert()` de exemplo — menor prioridade, não bloqueiam venda nem uso diário básico.
- O `centralPrioridadesService.js` e o `dashboardService.js` completos (com todas as consultas agregadas) existem na pasta `services/`, mas o `centro-de-controle-abf.html` usa uma versão simplificada inline no próprio HTML (mesma lógica, menos código) — dá pra trocar por eles quando o projeto ganhar um processo de build (bundler), porque hoje o HTML é um arquivo só, sem import de módulo entre arquivos.
- Score de Saúde no painel usa uma fórmula simplificada (baseada só em % de clientes em risco) até que existam pelo menos 30 dias de dado real pra calibrar os pesos completos descritos na arquitetura.

Nenhum desses pontos bloqueia venda ou deploy — o sistema sobe, loga, cadastra cliente, abre lavagem, registra pagamento, mostra dado real e o Copiloto responde. São refinamentos de produto pra depois que o Agnaldo começar a usar de verdade.

---

## O que eu não consegui testar (importante ler antes de vender como "pronto")

Eu não tenho acesso a criar um projeto Supabase, Netlify ou Groq de verdade — escrevi todo o código de acordo com o schema e a documentação oficial de cada serviço, mas **nunca rodei isso contra um ambiente real**. Isso significa: é bem provável que o primeiro deploy revele um erro pequeno (nome de coluna, join, variável de ambiente esquecida) que só aparece na prática. Reserve 1-2 horas pra esse ajuste fino antes de chamar de "pronto para o cliente final" — siga o passo 10 deste manual (Testar, na ordem) com atenção, principalmente o teste do Copiloto e do Motor de Oportunidades.
