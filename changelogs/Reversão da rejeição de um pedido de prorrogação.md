# Reversão da rejeição de um pedido de prorrogação

**Núcleo:** Monitoramento
**Collection afetada:** `submissionReadjustments`

## Campos alterados

| Campo | Antes | Depois |
|-------|-------|--------|
| `status` | `ANALISYS` | `SENT` |

## Inputs necessários

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| ID do pedido de prorrogação | ObjectId | Sim | `_id` em `submissionReadjustments` |

## Fluxo de execução

1. **Backup** — salva o documento em `pipeon_auto_backups`
2. **updateOne** — altera `status` para `SENT`
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Valide em Monitoramento o projeto e confirme a situação atual antes de executar
- Após o ajuste, o pedido retorna para avaliação no fluxo do sistema
