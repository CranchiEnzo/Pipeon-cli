# Alterar prazo das Avaliações de projeto em andamento

**Núcleo:** Editais
**Collection afetada:** `notices`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `validityEndProject` | Nova data (ISODate) |

## Inputs necessários

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| ID do Edital | ObjectId | Sim | Da URL do sistema |
| Nova data de validade | String | Sim | Formato ISO, +3h |

## Fluxo de execução

1. **Backup** — salva o documento de `notices` em `pipeon_auto_backups`
2. **updateOne** — atualiza `validityEndProject` com a nova data como ISODate
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Após a atualização, recarregue a página do edital para notar a modificação
- O banco está **3h adiantado** em relação ao horário local
