# Zerar notas de projetos de um avaliador

**Núcleo:** Avaliações
**Collection afetada:** `evaluations`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `evaluationAverage` | `0` |
| `evaluationSum` | `0` |
| `status` | `NOTSTARTED` |
| `phaseForm.blocks.$[].fields.$[].value` | removido (`$unset`) |
| `phaseForm.blocks.$[].fields.$[].justification` | removido (`$unset`) |

## Inputs necessários

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| ID do avaliador | ObjectId | Sim | `noticeEvaluator._id` em `evaluations` |
| ID do Edital | ObjectId | Sim | Campo `notice` em `evaluations` |

## Fluxo de execução

1. **Backup** — salva todos os documentos do avaliador no edital em `pipeon_auto_backups`
2. **updateMany** — aplica o reset em todas as avaliações
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Diferente de "Retornar avaliações para pendentes", este procedimento filtra por `noticeEvaluator._id`
  (não por `noticeEvaluator.userId`) conforme o script original
- Documente a execução no Discord com script + referência ao backup
