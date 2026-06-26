# Retirar projeto da lista de avaliadores (Declínio)

**Núcleo:** Avaliações
**Collection afetada:** `submissions`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `DECLINED` |
| `lastEvent.status` | `DECLINED` |
| `lastEventNotRestricted.status` | `DECLINED` |

## Inputs necessários

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| ID do projeto | ObjectId | Sim — `_id` em `submissions` |

## Fluxo de execução

1. **Backup** — salva o documento de `submissions` em `pipeon_auto_backups`
2. **updateOne** — aplica os campos de status
3. **Changelog** — registrado em `pipeon_changelogs`

## Limitação — SubmissionEvents

O passo de **criação do evento histórico** ("Projeto indeferido") em `SubmissionEvents`
requer clonar o último documento e alterar campos — operação que não é suportada
pelo executor genérico. Deve ser feito manualmente no banco após este procedimento.

Regras do evento manual:
- `status`: `DECLINED`
- Data do evento: data de abertura do ticket
- Deve aparecer abaixo do evento "Projeto enviado" na linha do tempo
