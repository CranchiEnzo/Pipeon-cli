# Política manual de supply-chain — cooldown de dependências

> Processo manual para repor (parcialmente) a proteção `minimumReleaseAge = 86400`
> que existia no `bunfig.toml` e foi perdida na migração bun → npm (`[1.5.1]`).
> Ver contexto no [CHANGELOG](../CHANGELOG.md).

## O que essa política faz (e o que não faz)

A regra é simples: **não instalar/atualizar para uma versão de pacote publicada há menos de 24h.**

O objetivo **não** é "detectar pacote malicioso" — é dar uma **janela de quarentena**
para que a comunidade detecte e despublique (yank) uma versão comprometida (ex.: conta
de mantenedor sequestrada) antes de ela entrar no nosso build. É uma camada de
*defesa-em-profundidade*, não uma garantia.

**Limitações honestas desta abordagem manual:**

- ⚠️ **Só cobre dependências diretas com conforto.** O `npm install` também resolve
  dependências **transitivas** (dependências das suas dependências). Checar a idade de
  todas as transitivas manualmente é inviável — a checagem abaixo foca no que você está
  adicionando/subindo diretamente.
- ⚠️ **Depende de disciplina humana.** Diferente do `minimumReleaseAge`, que era
  automático, aqui alguém precisa lembrar de rodar a checagem a cada mudança de dependência.
- ⚠️ **Não substitui análise de conteúdo** (o que o socket.dev faz). Versão "velha" não
  é sinônimo de versão "segura".

## Quando esta política se aplica

Apenas nos momentos em que **versões são resolvidas** — não em toda instalação:

| Situação | Aplica? | Por quê |
|----------|:-------:|---------|
| `npm ci` (CI/CD, setup limpo) | ❌ Não | Instala **exatamente** o que está pinado no `package-lock.json` |
| `npm install` (sem alterar deps) | ❌ Não | Respeita o lock existente |
| `npm install <novo-pacote>` | ✅ **Sim** | Resolve e adiciona uma versão nova |
| `npm update` / `npm install <pkg>@latest` | ✅ **Sim** | Sobe versões |
| Editar versão no `package.json` à mão | ✅ **Sim** | Próximo install vai resolver a nova versão |
| Regenerar o lock (`rm package-lock.json && npm install`) | ✅ **Sim** | Re-resolve tudo |

Como o `package-lock.json` é **versionado** e o CI usa `npm ci`, a exposição real fica
concentrada nesses momentos de atualização — o dia a dia (deploy, build) está coberto pelo lock.

## Passo a passo

### 1. Antes de adicionar/atualizar, descubra a versão-alvo

Para ver o que está desatualizado e qual versão o npm quer instalar:

```bash
npm outdated
```

Colunas: **Current** (instalado) · **Wanted** (o que o range no `package.json` permite) ·
**Latest** (última publicada). A versão-alvo de uma atualização normal é a coluna **Wanted**;
de um bump major é a **Latest**.

### 2. Cheque a data de publicação **da versão específica**

> ⚠️ **Não use** `npm view <pkg> time.modified` — esse campo é a última alteração de
> *metadados* (dist-tag, deprecação), **não** a data de publicação da versão. Sempre
> consulte o timestamp da versão exata.

```bash
# Mostra o timestamp de publicação da versão exata
npm view <pacote>@<versao> time --json
```

No objeto retornado, a chave igual à versão (ex.: `"19.2.0"`) é a data de publicação.
Alternativa visual: a página do pacote em `npmjs.com/package/<pacote>` mostra "Published".

### 3. Helper PowerShell (opcional)

Cole esta função no terminal (PowerShell) — ela calcula a idade da versão e diz se passa na regra:

```powershell
function Test-PkgAge {
  param(
    [Parameter(Mandatory)] [string] $Pkg,
    [Parameter(Mandatory)] [string] $Version,
    [int] $MinHours = 24
  )
  $times = npm view "$Pkg@$Version" time --json | ConvertFrom-Json
  $iso = $times.$Version
  if (-not $iso) { Write-Host "versao $Version nao encontrada para $Pkg" -ForegroundColor Yellow; return }
  $pub  = [datetime]::Parse($iso).ToUniversalTime()
  $ageH = [math]::Round(((Get-Date).ToUniversalTime() - $pub).TotalHours, 1)
  $dias = [math]::Round($ageH / 24, 1)
  Write-Host "$Pkg@$Version publicado em $iso (UTC) -> $ageH h ($dias dias)"
  if ($ageH -lt $MinHours) {
    Write-Host "BLOQUEAR: publicado ha menos de $MinHours h" -ForegroundColor Red
  } else {
    Write-Host "OK: passou da quarentena de $MinHours h" -ForegroundColor Green
  }
}

# Uso:
Test-PkgAge -Pkg react -Version 19.2.0
Test-PkgAge -Pkg "@azure/msal-browser" -Version 4.0.0 -MinHours 48
```

### 4. Decida

- **Idade ≥ 24h** → pode instalar.
- **Idade < 24h** → **aguarde** e refaça a checagem depois. Se a atualização for urgente
  (ex.: correção de vulnerabilidade crítica), instale conscientemente e registre a exceção
  na descrição do PR.

### 5. Instale com versão fixa e revise o diff do lock

```bash
npm install <pacote>@<versao>   # versão exata, não range aberto
```

No PR, **revise o diff do `package-lock.json`**: confira se só entraram os pacotes
esperados. Mudanças transitivas inesperadas (muitos pacotes novos vindos de um único
`npm install`) merecem um olhar mais atento — é onde um ataque de supply-chain se esconderia.

## Resumo do fluxo

```
npm outdated                         # 1. o que/qual versão
npm view <pkg>@<ver> time --json     # 2. data de publicação da versão exata
Test-PkgAge <pkg> <ver>              # 3. idade >= 24h?
npm install <pkg>@<ver>              # 5. instalar fixo
# revisar diff do package-lock.json no PR
```

## Threshold

Mantemos **24h** para espelhar a configuração original (`minimumReleaseAge = 86400` segundos).
Para dependências sensíveis (auth, cripto, build), considere `-MinHours 168` (7 dias) — quanto
maior a janela, maior a chance de a comunidade detectar um pacote comprometido.
