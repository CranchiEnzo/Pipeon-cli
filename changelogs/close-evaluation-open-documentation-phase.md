# Encerrar fase de avaliação de projetos e habilitar fase de documentação

**Núcleo:** Ciclos
**Collection afetada:** `notices`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `configuration.status` | `completedEvaluationsProject` |
| `evaluation.projectAppealPhase.isCompleted` | `true` |
| `evaluation.distributionCompleted` | `true` |
| `evaluation.allEvaluationsFinished` | `true` |

## Inputs necessários

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| ID do Ciclo | ObjectId | Sim |

## Fluxo de execução

1. **Backup** — salva o documento de `notices` em `pipeon_auto_backups`
2. **updateOne** — aplica todos os campos acima em um único passo
3. **Changelog** — registrado em `pipeon_changelogs`
