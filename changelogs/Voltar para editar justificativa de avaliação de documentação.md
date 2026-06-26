# Voltar para editar justificativa de avaliação de documentação

**Núcleo:** Documentação
**Collection afetada:** `documentEvaluations`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `CORRECTIONSENT` |

## Inputs necessários

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| Número do projeto | String | Sim |

## Fluxo de execução

1. **Backup** — salva o documento de `documentEvaluations` em `pipeon_auto_backups`
2. **updateOne** — define `status = CORRECTIONSENT`
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Após o ajuste, a análise de documentação fica disponível para edição no sistema
