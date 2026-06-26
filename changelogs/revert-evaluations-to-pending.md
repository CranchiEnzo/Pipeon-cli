# Retornar avaliações para pendentes para substituição de avaliador(a)

**Núcleo:** Avaliações
**Collection afetada:** `evaluations`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `NOTSTARTED` |
| `phaseForm.blocks.$[].fields.$[].value` | `null` |
| `phaseForm.blocks.$[].sumValue` | `null` |
| `evaluationAverage` | removido (`$unset`) |
| `evaluationAverageByBlocks` | removido (`$unset`) |
| `evaluationSum` | removido (`$unset`) |
| `submittedDate` | removido (`$unset`) |
| `evaluatorNote` | removido (`$unset`) |

## Inputs necessários

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| ID do avaliador | ObjectId | Sim | `noticeEvaluator.userId` em `evaluations` |
| ID do Ciclo | ObjectId | Sim | Campo `notice` em `evaluations` |

## Fluxo de execução

1. **Backup** — salva todos os documentos do avaliador no ciclo em `pipeon_auto_backups`
2. **updateMany** — aplica o reset em todas as avaliações
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Valide no sistema se a quantidade de documentos no banco bate com o total de avaliações do avaliador
