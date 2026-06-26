# Status de não contratado para marcado para contratação

**Núcleo:** Contratação
**Collections afetadas:** `contractDigital`, `submissions`

## Passo 1 — contractDigital

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `MARKEDFORCONTRACT` |
| `contractToSignLimitDate` | renomeado para `contractToSignLimitDate_old` |
| `contractToSignStartDate` | renomeado para `contractToSignStartDate_old` |
| `contractToSignFile` | renomeado para `contractToSignFile_old` |
| `contractToSignSentDate` | renomeado para `contractToSignSentDate_old` |

## Passo 2 — submissions

| Campo | Valor aplicado |
|-------|---------------|
| `lastEvent.status` | `CONTRACTDOCUMENTSSENT` |
| `lastEventNotRestricted.status` | `CONTRACTDOCUMENTSSENT` |

## Inputs necessários

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| Número do projeto | String | Sim |

## Fluxo de execução

1. **Backup** de `contractDigital` em `pipeon_auto_backups`
2. **updateOne** em `contractDigital` — status + renomeação dos campos
3. **Backup** de `submissions` em `pipeon_auto_backups`
4. **updateOne** em `submissions` — atualiza lastEvent
5. **Changelog** — registrado em `pipeon_changelogs`
