# Reabrir a fase de recurso em ciclo

**Núcleo:** Ciclos
**Collection afetada:** `notices`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `configuration.status` | `openForEvaluationsDocument` |
| `evaluation.documentEvaluation.appeal.appealfinished` | `false` |

## Inputs necessários

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| ID do Ciclo | ObjectId | Sim |

## Fluxo de execução

1. **Backup** — salva o documento de `notices` em `pipeon_auto_backups` antes de qualquer alteração
2. **updateOne** — aplica os campos acima no ciclo informado
3. **Changelog** — registrado automaticamente em `pipeon_changelogs`

## Observações

- O ID do ciclo é obtido diretamente na URL do sistema
- Execute sempre com número de ticket para rastreabilidade
