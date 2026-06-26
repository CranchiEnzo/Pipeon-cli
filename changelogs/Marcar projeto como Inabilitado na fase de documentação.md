# Marcar projeto como "Inabilitado" na fase de documentação

**Núcleo:** Documentação
**Collection afetada:** `documentEvaluations`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `DISABLED` |
| `evaluatorNote` | Justificativa (opcional) |

## Inputs necessários

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| Número do projeto | String | Sim | Ex: `12345` |
| Justificativa de inabilitação | String | Não | Deixe em branco se não solicitado |

## Fluxo de execução

1. **Backup** — salva o documento de `documentEvaluations` em `pipeon_auto_backups`
2. **updateOne** — define `status = DISABLED` e aplica `evaluatorNote` se preenchida
3. **Changelog** — registrado em `pipeon_changelogs`
