# Disponibilizar Alteração de Projeto quando prestação de contas estiver iniciada

**Núcleo:** Prestação de Contas
**Collection afetada:** `accountabilityReports`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `NOTIFIED` |

## Inputs necessários

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| ID do documento em accountabilityReports | ObjectId | Sim | `_id` do registro de prestação de contas |

## Fluxo de execução

1. **Backup** — salva o documento em `pipeon_auto_backups`
2. **updateOne** — define `status = NOTIFIED`
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Após o ajuste, o campo de alteração de projetos fica disponível para o proponente
