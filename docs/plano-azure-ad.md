# Plano de Ação — Integração Azure AD (Microsoft Entra ID)

> Documento de planejamento para a substituição do login atual (email/senha) pela
> autenticação via **Microsoft Entra ID** no projeto **Pipeon**.

## Decisões já tomadas

| Tema | Decisão |
|------|---------|
| Estratégia de login | **Substituir totalmente** o email/senha pelo login Microsoft |
| Origem dos papéis | **Lookup no `pipeon_users`** (mantém a gestão de papéis no admin atual) |
| Escopo do backend | **Dev (Express) primeiro**; worker de produção como etapa posterior |
| Usuário Entra fora do `pipeon_users` | **Auto-criar com role `user`** (opção b); admin promove depois |

---

## Estado atual da autenticação

- Login por email+senha em `src/routes/index.tsx` → `POST /api/auth/login`
- Backend (`local-api/server.js`) só busca o usuário por email em `pipeon_users`
  (**não valida senha**) e emite um JWT próprio (HS256, segredo `pipeon-local-dev-secret`, 8h)
- O token vai pro `sessionStorage` → fluxo `select-system` → `select-session`
- `src/lib/auth.ts` já **decodifica claims no formato .NET/Microsoft**
  (`emailaddress`, `role` no namespace `schemas.microsoft.com`) — o terreno já foi
  preparado para tokens Microsoft
- Permissões: claim `role` → `admin`/`operator`/`user`, sincronizado de `pipeon_settings`
- Dois backends: Express (dev) e Cloudflare Worker em produção
  (`your-worker.your-subdomain.workers.dev`, fora deste repo)

---

## Decisão de arquitetura central: padrão *token broker*

Dado que os papéis ficam no `pipeon_users` e queremos mexer o mínimo possível, **não**
enviamos o token do Entra direto em cada chamada MongoDB. Em vez disso:

```
[Browser]                          [Express local-api]                [Entra ID]
  MSAL faz login  ──────────────────────────────────────────────────►  autentica
  recebe ID token  ◄─────────────────────────────────────────────────  emite ID token
  POST /api/auth/microsoft (ID token) ──► valida assinatura via JWKS ──► (busca chaves)
                                          busca email em pipeon_users
                                          emite JWT interno (role)
  recebe JWT interno  ◄───────────────────
  segue exatamente o fluxo atual ──► /api/mongodb/* com Bearer <JWT interno>
```

**Por que esse desenho:** todo o restante do sistema — `atlas.ts` (header Bearer),
`auth.ts` (`decodeToken`), `permissions.ts` (`syncPermissionsFromDb`), o fluxo
select-system → select-session, e o `verifyToken` do Express — **continua idêntico**.
Só trocamos *como o JWT inicial nasce*. O Entra entra só no topo. Isso também torna a
futura migração do worker de produção trivial (espelhar um endpoint).

Usaremos validação do **ID token** (audience = nosso `clientId`), que dispensa expor um
scope de API customizado. Se mais tarde a API virar um recurso separado, troca-se para
access token + scope exposto.

**Fundamentação técnica:** o fluxo recomendado pela Microsoft para SPAs é o
**Authorization Code Flow + PKCE** via `@azure/msal-browser` + `@azure/msal-react`
(o *implicit flow* está obsoleto).

---

## Fase 0 — Pré-requisitos no portal Azure (admin do tenant)

| Item | Onde | Uso |
|------|------|-----|
| **Tenant ID** (Directory ID) | Entra ID → Overview | montar `authority` |
| **Client ID** (Application ID) | App registration → Overview | MSAL + audience na validação |
| **App registration** tipo SPA | App registrations → New | habilita PKCE/CORS |
| **Redirect URIs** | Authentication → Single-page application | `http://localhost:5173` (dev) e a URL de prod |

Configurar a plataforma como **Single-page application** (não "Web") — é o que habilita
PKCE e CORS no endpoint de login. Sem client secret.

> ℹ️ Política da Fase 5 já decidida: usuário que existe no Entra mas **não** está em
> `pipeon_users` é **auto-criado com role `user`** no primeiro login (opção b).

---

## Fase 1 — Setup do MSAL no frontend

1. Instalar: `npm install @azure/msal-browser @azure/msal-react`
2. Criar `src/lib/msal.ts` com a config:
   - `auth.clientId`, `auth.authority = https://login.microsoftonline.com/<TENANT_ID>`,
     `auth.redirectUri`
   - `cache.cacheLocation = "sessionStorage"` (alinha com o resto do app, que já usa
     sessionStorage para a config)
   - Variáveis via `VITE_ENTRA_CLIENT_ID` / `VITE_ENTRA_TENANT_ID` no `.env`
3. Envolver a aplicação no `<MsalProvider>` — em `src/router.tsx` ou em
   `src/routes/__root.tsx`, por fora do `QueryClientProvider`.

## Fase 2 — Endpoint broker no Express (`local-api/server.js`)

1. Instalar: `cd local-api && npm i jwks-rsa`
2. Novo `POST /api/auth/microsoft`:
   - Recebe `{ idToken }` no body
   - Valida assinatura via `jwks-rsa` contra
     `https://login.microsoftonline.com/<TENANT_ID>/discovery/v2.0/keys`
   - Valida `iss` (issuer do tenant) e `aud` (= `ENTRA_CLIENT_ID`)
   - Extrai email (`preferred_username` / `email`), `oid`, `name`
   - `findOne` em `pipeon_users` por email (lowercased) → pega `role`
   - **Se não encontrar** (política da Fase 5, opção b): `insertOne` em `pipeon_users`
     com `{ email, name, role: "user", oid, createdAt, provisionedVia: "entra" }` e
     segue com `role: "user"`
   - Emite o **JWT interno** com `jwt.sign(...)` exatamente como hoje — mesma assinatura
     de claims (`sub`, `email`, `name`, `role`)
3. Novas envs em `local-api/.env`: `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`
4. Remover/desativar o `POST /api/auth/login` antigo.

> O `verifyToken` e todas as rotas `/api/mongodb/*` e `/api/pipeon/*` **não mudam** —
> continuam validando o JWT interno HS256.

## Fase 3 — Trocar a UI de login (`src/routes/index.tsx`)

1. Remover o formulário email/senha
2. Botão único **"Entrar com Microsoft"** → `instance.loginRedirect()` (ou `loginPopup`)
3. No retorno (`handleRedirectPromise` / `useMsal`), pegar o `idToken`, chamar
   `POST /api/auth/microsoft`, e com o JWT interno chamar `savePendingToken(token)` +
   `navigate({ to: "/select-system" })` — **mesma transição de hoje**.
4. Logout: adicionar `instance.logoutRedirect()` junto do `clearConfig()` onde houver
   logout no menu/perfil.

## Fase 4 — Limpeza do legado de senha

- Remover rotas `src/routes/register.tsx` e `src/routes/forgot-password.tsx` e seus
  links na tela de login
- Remover campo `password` da criação de usuário no admin e no backend — `pipeon_users`
  passa a ser só email + role + nome
- Avaliar campo de alterar senha em `src/routes/profile.tsx`

## Fase 5 — Papéis e provisionamento (decidido: opção b)

Como o role vem do `pipeon_users`, foi definido o comportamento para o usuário Entra que
autentica com sucesso mas **não está** na coleção: **auto-criar com role `user`**
(provisionamento *just-in-time*). O admin promove depois para `operator`/`admin` pela
tela de admin atual.

**Justificativa da escolha (b vs. a):** a autenticação já está garantida pelo Entra
(tenant corporativo), então a coleção `pipeon_users` deixa de ser a fronteira de *quem
entra* e passa a ser só a fronteira de *o que cada um pode fazer*. Bloquear (opção a)
exigiria um cadastro manual prévio para cada pessoa antes do primeiro acesso — atrito
desnecessário num tenant fechado. Com o auto-provisionamento, o usuário novo entra com o
papel de menor privilégio (`user`) e nada além disso até um admin promovê-lo.

### Regras do provisionamento

1. **Quando dispara:** apenas dentro do `POST /api/auth/microsoft`, depois da assinatura
   do ID token já ter sido validada via JWKS e do `iss`/`aud` conferidos. Nunca se cria
   usuário a partir de um token não verificado.
2. **Chave de identidade:** email em lowercase (mesma normalização do `findOne`). Para
   evitar corrida no primeiro login simultâneo, usar `findOneAndUpdate` com
   `upsert: true` e `$setOnInsert` em vez de `findOne` + `insertOne` separados.
3. **Documento criado:**
   ```json
   {
     "email": "<lowercased>",
     "name": "<claim name>",
     "role": "user",
     "oid": "<claim oid do Entra>",
     "provisionedVia": "entra",
     "createdAt": "<ISO date>"
   }
   ```
   Sem campo `password` (a Fase 4 já o removeu da coleção).
4. **Papel sempre `user` no insert:** o provisionamento nunca concede `operator`/`admin`.
   Promoção é ação explícita e manual do admin.
5. **Usuário já existente:** o `$setOnInsert` não toca o `role` atual — quem já é
   `operator`/`admin` mantém o papel. Opcionalmente atualizar `name`/`oid` em todo login
   para refletir mudanças no Entra (decisão menor, pode ficar para depois).
6. **Auditoria:** registrar a auto-criação no `pipeon_operations` (ex.: ação
   `user.provisioned`) para haver rastro de quem entrou pela primeira vez.

## Fase 6 — Testes manuais (não há suíte automatizada)

Login → seleção de sistema/sessão → execução de procedimento → expiração de token
(401 já redireciona) → logout → matriz de papéis (admin/operator/user).

## Fase 7 — Produção (etapa posterior, fora deste repo)

Espelhar o endpoint broker + validação JWKS no worker `pipeon-api`, registrar a redirect
URI de produção no Azure, e setar as envs no Cloudflare. Como o frontend só fala com o
broker, não há outra mudança.

---

## Resumo do que muda vs. o que fica

| Muda | Fica igual |
|------|-----------|
| Tela de login, `msal.ts`, provider | `atlas.ts`, `auth.ts` (já lê claims Microsoft!), `permissions.ts` |
| `/api/auth/login` → `/api/auth/microsoft` | `verifyToken`, todas as rotas `/api/mongodb` e `/api/pipeon` |
| Remoção de register/forgot/senha | Fluxo select-system → select-session → menu |

---

## Pontos em aberto antes de "ligar"

> A preparação dormente no repo já está pronta (ver seção abaixo). Estes pontos bloqueiam
> apenas a **ativação** do login Microsoft, não a preparação.

1. **App registration (bloqueador externo)** — ainda **não existe**. É preciso criar no
   portal Azure o registro tipo SPA (Fase 0), obter Tenant ID + Client ID, cadastrar as
   redirect URIs e preencher as envs `VITE_ENTRA_*` / `ENTRA_*`. Toda a Fase 0 está
   pendente do lado externo.
2. **(review) Corrida no primeiro login simultâneo** — o provisionamento usa
   `findOneAndUpdate` + `upsert`. Definir índice **único** em `email` na `pipeon_users` e
   tratar `E11000` (duplicate key) com retry/lookup, para o caso de dois primeiros logins
   concorrentes. Ver Fase 5, regra 2.
3. **(review) Auditoria do provisionamento** — gravar a auto-criação em
   `pipeon_operations` (ação `user.provisioned`). Já marcado como `// TODO` no endpoint e
   na Fase 5, regra 6.
4. **(menor) Atualização de perfil** — atualizar `name`/`oid` do usuário existente a cada
   login, ou só no primeiro provisionamento? — ver Fase 5, regra 5.

---

## Estado da preparação no repo

> O ambiente externo (App registration / Tenant ID / Client ID) **ainda não existe**. O
> repositório foi preparado para "ligar" o Entra quando isso estiver pronto. Tudo abaixo é
> **dormente e não-destrutivo** — o login atual (email/senha) continua funcionando.

**Já materializado:**

- **Dependências:** `@azure/msal-browser` + `@azure/msal-react` (frontend) e `jwks-rsa`
  (local-api) instaladas.
- **Templates de env:** `.env.example` (raiz, novo) e `.env.production` com
  `VITE_ENTRA_CLIENT_ID` / `VITE_ENTRA_TENANT_ID` (+ `VITE_ENTRA_REDIRECT_URI` opcional);
  `local-api/.env.example` com `ENTRA_TENANT_ID` / `ENTRA_CLIENT_ID`. Todos vazios.
- **Frontend:** `src/lib/msal.ts` com `msalConfig`, `loginRequest` e a flag
  `isEntraConfigured`. **Não importado em lugar nenhum ainda** (não entra no bundle).
- **Backend:** `POST /api/auth/microsoft` em `local-api/server.js` com validação JWKS +
  provisionamento JIT (Fase 5b) já escritos, mas **gated**: responde `503` enquanto
  `ENTRA_TENANT_ID`/`ENTRA_CLIENT_ID` estiverem ausentes. O `POST /api/auth/login` e o
  `verifyToken` permanecem intactos.

**Passos para "ligar" (quando os IDs existirem):**

1. Criar o App registration (SPA) no Azure e preencher as envs `VITE_ENTRA_*` e `ENTRA_*`.
2. Envolver o app no `<MsalProvider>` usando `msalConfig` (Fase 1).
3. Trocar a UI de login pelo botão "Entrar com Microsoft" → `POST /api/auth/microsoft`
   (Fase 3) e remover o legado de senha (Fase 4).
4. Espelhar o broker no worker de produção (Fase 7).
