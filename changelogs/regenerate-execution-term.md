# Regerar termo de execução após assinatura do solicitante

**Núcleo:** Contratação
**Collection afetada:** `contractDigital`

> Este procedimento foi dividido em **2 etapas** que devem ser executadas em momentos diferentes.

## Etapa 1 — Liberar geração

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `CONTRACTATTACHED` |

Permite que o sistema regere o termo de execução após ajuste no modelo de documento.

## Etapa 2 — Retornar para SIGNATURESENT

| Campo | Valor aplicado |
|-------|---------------|
| `status` | `SIGNATURESENT` |

Executar **após** o termo ser regenerado, para que a equipe possa assinar.

## Inputs necessários (ambas as etapas)

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| ID do projeto | ObjectId | Sim | `submission._id` em `contractDigital` |

## Fluxo de execução

1. **Backup** — salva o documento em `pipeon_auto_backups`
2. **updateOne** — aplica o status correspondente à etapa
3. **Changelog** — registrado em `pipeon_changelogs`

## Ordem de execução

1. Ajuste o modelo de documento no sistema
2. Execute **Etapa 1** (CONTRACTATTACHED)
3. Verifique que o novo termo foi gerado
4. Execute **Etapa 2** (SIGNATURESENT)
