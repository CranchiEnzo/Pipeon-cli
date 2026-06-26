# Retornar Ciclo para Concluir Etapa de Inscrições

**Núcleo:** Ciclos
**Collection afetada:** `notices`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `configuration.status` | `closedForSubscriptions` |

## Inputs necessários

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| ID do Ciclo | ObjectId | Sim |

## Fluxo de execução

1. **Backup** — salva o documento de `notices` em `pipeon_auto_backups`
2. **updateOne** — define `configuration.status = closedForSubscriptions`
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Usar quando o ciclo foi avançado por engano para Avaliações de Projetos ou de Documentação
- Após o ajuste, o ciclo retorna para a etapa de Conclusão das Inscrições
