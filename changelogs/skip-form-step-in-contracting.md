# Pular etapa de formulário na contratação

**Núcleo:** Contratação
**Collection afetada:** `contractDigital`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `MARKEDFORCONTRACT` (todos os projetos do ciclo) |

## Inputs necessários

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| ID do Ciclo | ObjectId | Sim |

## Fluxo de execução

1. **Backup** — salva todos os documentos de `contractDigital` do ciclo em `pipeon_auto_backups`
2. **updateMany** — marca todos os contratos do ciclo como `MARKEDFORCONTRACT`
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Os projetos passam direto para "Marcado para contemplação", pulando o preenchimento do formulário
- Os solicitantes **não devem** ser notificados para preenchimento do formulário
