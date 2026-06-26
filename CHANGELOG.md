# CHANGELOG — Pipeon

Todas as alterações relevantes do projeto são registradas aqui.
Formato: `[versão] — Data — Descrição`

---

## [1.5.1] — 2026-06-22

### Correção de deploy + migração de bun para npm

> O deploy para Cloudflare Workers (GitHub Actions) quebrava no passo `npm ci` porque o `package-lock.json` versionado não continha as dependências Azure adicionadas na preparação `[1.5.0]`. Causa raiz: o projeto mantinha **dois locks** (`bun.lock` local, `package-lock.json` no CI) atualizados por ferramentas diferentes, que saíram de sincronia. A correção elimina a causa raiz padronizando tudo em npm.

- **Deploy destravado**: `package-lock.json` regenerado com `npm install` (limpo) e sincronizado com as dependências `@azure/msal-browser` / `@azure/msal-react` / `@azure/msal-common`. Validado com `npm ci --dry-run` (lock e `package.json` em sincronia). A preparação Azure AD (`[1.5.0]`) permanece **dormente e intacta** — só muda como as dependências são instaladas, não o que está declarado.
- **Migração bun → npm** (causa raiz eliminada — um único lock):
  - **`bun.lock` removido** (fonte da divergência).
  - **`bunfig.toml` removido**.
  - **`start-dev.ps1`**: removida a verificação/uso do `bun`; passo final agora roda `npm run dev`.
  - **`CLAUDE.md`**: seção de comandos atualizada de `bun *` para `npm *`; "uses bun as package manager" → "uses npm as package manager".
  - **`docs/plano-azure-ad.md`**: instrução de instalação na Fase 1 trocada de `bun add` para `npm install`.
- **⚠️ Impacto negativo — camada de defesa-em-profundidade removida (supply-chain)**: o `bunfig.toml` removido continha `minimumReleaseAge = 86400` (24h em segundos), um **cooldown** (quarentena de versão) que se recusava a resolver versões de pacotes publicadas há menos de um dia. O propósito não é "bloquear pacote malicioso", e sim **dar tempo à comunidade de detectar e despublicar (yank)** uma versão comprometida (ex.: conta de mantenedor sequestrada) antes de ela cair no build — mitiga *install-time supply-chain attacks*. O **npm não tem equivalente nativo**. A proteção foi perdida na migração.
  - **Magnitude real: baixa-a-moderada**, não crítica. O cooldown só atua ao **resolver versões** (adicionar pacote, `npm update`, regenerar lock); como o `package-lock.json` é versionado e o CI usa `npm ci` (instala exatamente o que está pinado), a exposição fica **concentrada nos momentos de atualização de dependência**, não em toda instalação.
  - _Follow-ups sugeridos_ (não equivalentes entre si, nenhum replica o cooldown puro de tempo):
    - **[socket.dev](https://socket.dev)** — análise comportamental do pacote (install scripts suspeitos, exfiltração). Mais forte: analisa *conteúdo*, não só *idade*.
    - **Dependabot** — alertas de vulnerabilidade + PRs de atualização. Complementar, mas atenção: **aumenta** a frequência de updates, o que pode ir *contra* a lógica do cooldown.
    - **Política manual** — "não atualizar dependência com menos de X dias". Equivale ao mecanismo original só com disciplina real. **Adotada por ora** — passo a passo documentado em [`docs/politica-supply-chain.md`](docs/politica-supply-chain.md).
- **Trade-off menor**: `npm install` é mais lento que `bun install`. Sem perda de funcionalidade ou compatibilidade — o bun nunca foi runtime aqui (os scripts apenas chamam `vite`/`eslint`/`prettier`).
- **CI inalterado**: `.github/workflows/deploy.yml` já usava `npm ci` + Node 22 + `cache: npm` — nenhuma mudança necessária no workflow.

---

## [1.5.0] — 2026-06-18

### Preparação do repositório para o login Azure AD (dormente, não-destrutivo)

> O ambiente externo (App registration / Tenant ID / Client ID) ainda não existe. Toda a infraestrutura abaixo fica **inerte** enquanto as variáveis `ENTRA_*` / `VITE_ENTRA_*` estiverem vazias — o login atual (email/senha) continua funcionando intacto.

- **Decisão da Fase 5 registrada (opção b)**: usuário que autentica no Entra mas não existe em `pipeon_users` é **auto-provisionado com role `user`** (just-in-time); admin promove depois. Documentado em `docs/plano-azure-ad.md` com justificativa e regras de provisionamento.
- **Dependências adicionadas**:
  - Frontend (`package.json`): `@azure/msal-browser` e `@azure/msal-react`.
  - Backend (`local-api/package.json`): `jwks-rsa` (validação de assinatura via JWKS).
- **`src/lib/msal.ts`** adicionado (dormente, **não importado em nenhum lugar** — não entra no bundle): exporta `msalConfig` (authority do tenant, `redirectUri` guardado para SSR, cache em `sessionStorage`), `loginRequest` (`openid`/`profile`/`email`) e a flag `isEntraConfigured`.
- **Endpoint `POST /api/auth/microsoft`** adicionado em `local-api/server.js` (padrão *token broker*):
  - **Gated**: responde `503` enquanto `ENTRA_TENANT_ID`/`ENTRA_CLIENT_ID` estiverem ausentes.
  - Quando configurado: valida o ID token via `jwks-rsa` (assinatura + `iss` do tenant + `aud` = client ID, `RS256`), extrai `email`/`name`/`oid`, faz provisionamento JIT com `findOneAndUpdate` + `upsert` + `$setOnInsert` (não rebaixa role de usuário existente) e emite o **mesmo JWT interno HS256** do login atual.
  - `POST /api/auth/login` e `verifyToken` permanecem **inalterados**.
- **Templates de ambiente**:
  - `.env.example` (raiz, novo) com `VITE_API_URL` e bloco `VITE_ENTRA_*` (+ `VITE_ENTRA_REDIRECT_URI` opcional).
  - `.env.production` e `local-api/.env.example` com os placeholders Entra comentados.
- **Verificação**: `bun run build` OK; `tsc` sem erros no código novo; servidor sobe sem crash; `POST /api/auth/microsoft` retorna `503` dormente; `POST /api/auth/login` segue respondendo normalmente.

---

## [1.4.1] — 2026-06-17

### Documentação — Plano de ação para integração Azure AD

- **`docs/plano-azure-ad.md`** adicionado: plano de ação para substituir o login email/senha pela autenticação **Microsoft Entra ID (Azure AD)**.
  - Desenho de arquitetura *token broker*: MSAL no frontend obtém ID token → endpoint `POST /api/auth/microsoft` valida via JWKS e emite o JWT interno atual, mantendo `atlas.ts`, `auth.ts`, `permissions.ts` e o fluxo select-system/select-session inalterados.
  - Fases 0–7: pré-requisitos no portal Azure, setup MSAL (`@azure/msal-browser` + `@azure/msal-react`), endpoint broker no Express, troca da UI de login, limpeza do legado de senha, papéis via `pipeon_users`, testes e migração futura do worker de produção.
  - Decisões registradas: substituição total do login, papéis via lookup em `pipeon_users`, backend de dev (Express) primeiro.
  - Pontos em aberto: política para usuário Entra fora de `pipeon_users` e status do App registration no Azure.

---

## [1.4.0] — 2026-06-16

### Remoção da integração com IA (Anthropic) e script de inicialização local

- **Endpoint removido**: `POST /api/pipeon/ai/generate-procedure` removido de `local-api/server.js` — geração de procedimentos via Claude Haiku descontinuada.
- **Dependência removida**: `@anthropic-ai/sdk` removido de `local-api/package.json`; `local-api/package-lock.json` atualizado.
- **Variável de ambiente removida**: `ANTHROPIC_API_KEY` não é mais necessária em `local-api/.env`.
- **Documentação atualizada**:
  - `CLAUDE.md`: referências à API da Anthropic e ao endpoint de IA removidas.
  - `docs/pipeon-documentacao.html`: seção de endpoint IA, linha da tabela de stack, variável de ambiente e callout de segurança da chave removidos; wizard de procedimentos atualizado para descrever cadastro manual.
- **Script `start-dev.ps1`** adicionado na raiz: inicializa frontend (Vite `:5173`) e backend (`local-api` Express `:5000`) em paralelo com uma única execução. Verifica `bun`, `npm`, cria `local-api/.env` a partir do `.env.example` se ausente e instala dependências automaticamente.
- **`package.json`**: novo script `dev:local` executa `start-dev.ps1` via PowerShell.

---

## [1.3.0] — 2026-06-15

### UI — Redesign de tema e menu

- **Sistema de temas claro/escuro**: toggle no canto superior esquerdo com ícone de sol (tema claro) e lua (tema escuro). Preferência salva em `localStorage` (`pipeon-theme`).
- **Anti-FOUC**: script inline no `<head>` aplica o tema salvo antes do primeiro render, evitando flash de cor incorreta.
- **Paleta de cores atualizada**: cor primária alterada de verde para azul.
  - Tema claro: fundo azul-acinzentado, cards brancos, primário `#0077ff`.
  - Tema escuro: fundo navy escuro, cards navy profundo, primário `#00b8ff`.
- **Logo substituída**: imagem removida; novo logo é um ícone `ChevronUp` (Lucide) em círculo `bg-primary/10`, cor segue o tema.
- **Título alterado**: "SUPORTE AUTOMATIZADO" → **PIPEON**. Subtítulo redundante removido.
- **Cards do menu redesenhados**: cada item tem ícone Lucide (Settings2, Database, History, AlarmClock, ShieldCheck, LogOut), título, descrição e seta `→` animada no hover. Padding vertical e indent da descrição ajustados para bater com o design de referência.

---

## [1.2.0] — 2026-06-15

### Catálogo de procedimentos operacionais

- **21 procedimentos** adicionados ao catálogo `pipeon_procedures` via `local-api/seed-procedures.js`.
- Procedimentos criados **sem núcleo atribuído** por padrão (regra: núcleo só é vinculado quando explicitamente solicitado).
- Script `local-api/clear-procedure-nucleos.js` para limpar núcleos incorretos de seeds anteriores.

### Novos endpoints em `local-api/server.js`

- `POST /api/pipeon/backup/create-generic` — backup genérico de qualquer coleção/filtro, salva em `pipeon_auto_backups`.
- `GET /api/pipeon/changelogs` — listagem de changelogs de execução com filtro por `ticketId` e `procedureId`.
- `POST /api/pipeon/changelogs` — registro de changelog por execução em `pipeon_changelogs`.

### Executor de procedimentos (`procedure.$id.tsx`)

- Suporte ao step de operação `"backup"`: chama `/api/pipeon/backup/create-generic` antes de qualquer mutação.
- Geração de changelog por execução: coleta resultados de cada step e registra em `pipeon_changelogs` em paralelo com `logOperation`.

### Admin — Aba de Procedimentos

- Card **"Sem vínculo"** exibido na grid de núcleos quando há procedimentos sem núcleo atribuído.
- Ao clicar no card, navega para `/admin-nucleus/sem-vinculo` — página dedicada que lista os procedimentos sem núcleo com botão **Mover** para atribuição.
- Rota `/admin-nucleus/$nucleo` atualizada para detectar o sentinel `sem-vinculo` e filtrar por `!p.nucleo`.

### Changelogs de execução

- 18 arquivos Markdown em `changelogs/`, um por procedimento documentado, descrevendo coleções afetadas, campos alterados, inputs necessários e fluxo de execução.

---

## [1.1.0] — anterior

### Registro inicial

- Estrutura base do Pipeon: React 19 + TanStack Start, Express local-api, MongoDB dual (pipeon + target-database).
- Autenticação JWT, permissões por cargo, executor de procedimentos genérico.
- Backup, histórico de operações, procedimentos agendados (cron), painel de administração.
- Procedimento legado `reset-evaluations` com rota dedicada.
