# Voltar Parecerista para Pendentes de Credenciamento

**Núcleo:** Pareceristas
**Collections afetadas:** `reviewers`, `reviewerEvaluations`

## Passo 1 — reviewers

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `SUBMITTED` |

## Passo 2 — reviewerEvaluations

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `PENDING` |

## Inputs necessários

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| userId do parecerista | ObjectId | Sim | Campo `userId` em `reviewers` |
| _id do documento reviewers | ObjectId | Sim | Necessário para filtrar `reviewerEvaluations.reviewerId` |

## Fluxo de execução

1. **Backup** de `reviewers` em `pipeon_auto_backups`
2. **updateOne** em `reviewers` — define `status = SUBMITTED`
3. **Backup** de `reviewerEvaluations` em `pipeon_auto_backups`
4. **updateOne** em `reviewerEvaluations` — define `status = PENDING`
5. **Changelog** — registrado em `pipeon_changelogs`

## Como obter o _id do documento reviewers

Acesse a collection `reviewers`, filtre por `{ userId: ObjectId("...") }` e copie o `_id` do documento retornado.

## Resultado esperado

- Parecerista sai da aba Credenciados
- Aparece novamente em Pendentes de Credenciamento
