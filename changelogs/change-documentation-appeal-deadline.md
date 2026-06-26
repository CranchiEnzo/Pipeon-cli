# Alterar data limite para envio de recurso de documentação

**Núcleo:** Ciclos
**Collection afetada:** `notices`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `evaluation.documentEvaluation.appeal.appealEnd` | Nova data (ISODate) |

## Inputs necessários

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| ID do Ciclo | ObjectId | Sim | Da URL do sistema |
| Nova data limite | String | Sim | Formato ISO, +3h (ex: `2023-06-06T02:59:59.999+00:00`) |

## Fluxo de execução

1. **Backup** — salva o documento de `notices` em `pipeon_auto_backups`
2. **updateOne** — atualiza `appealEnd` com a nova data como ISODate
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- O banco está **3h adiantado**: encerramento às 23h59 local = `T02:59:59.999+00:00` no banco
