# Atualização da data em Formulários adicionais

**Núcleo:** Formulários
**Collection afetada:** `additionalFormsRegister`

> Este procedimento foi dividido em **3 variantes** (uma por tipo de data) para evitar
> sobrescrita acidental de datas não solicitadas.

## Variantes disponíveis no sistema

| Procedimento | Campo alterado |
|-------------|---------------|
| Atualização da data em Formulários adicionais — Início | `startDate` |
| Atualização da data em Formulários adicionais — Término | `endDate` |
| Atualização da data em Formulários adicionais — Notificação | `notificationDate` |

## Inputs necessários (comuns às 3 variantes)

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| ID do Formulário adicional | ObjectId | Sim | Da URL do sistema (Editais → Formulários adicionais → Visualizar) |
| Nova data | String | Sim | Formato ISO, +3h (ex: `2026-03-12T02:59:59.999+00:00`) |

## Fluxo de execução (por variante)

1. **Backup** — salva o documento de `additionalFormsRegister` em `pipeon_auto_backups`
2. **updateOne** — atualiza o campo de data correspondente como ISODate
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- O banco está **3h adiantado**: encerramento às 23h59 local = `T02:59:59.999+00:00` no banco
- Em alguns casos pode ser necessário ajustar também em `additionalFormsSubmission`
