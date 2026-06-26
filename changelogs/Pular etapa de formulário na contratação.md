# Pular etapa de formulário na contratação

**Núcleo:** Contratação
**Collection afetada:** `contractDigital`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `MARKEDFORCONTRACT` (todos os projetos do edital) |

## Inputs necessários

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| ID do Edital | ObjectId | Sim |

## Fluxo de execução

1. **Backup** — salva todos os documentos de `contractDigital` do edital em `pipeon_auto_backups`
2. **updateMany** — marca todos os contratos do edital como `MARKEDFORCONTRACT`
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Os projetos passam direto para "Marcado para contemplação", pulando o preenchimento do formulário
- Os proponentes **não devem** ser notificados para preenchimento do formulário
