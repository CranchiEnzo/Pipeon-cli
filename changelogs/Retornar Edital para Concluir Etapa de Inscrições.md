# Retornar Edital para Concluir Etapa de Inscrições

**Núcleo:** Editais
**Collection afetada:** `notices`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `configuration.status` | `closedForSubscriptions` |

## Inputs necessários

| Campo | Tipo | Obrigatório |
|-------|------|------------|
| ID do Edital | ObjectId | Sim |

## Fluxo de execução

1. **Backup** — salva o documento de `notices` em `pipeon_auto_backups`
2. **updateOne** — define `configuration.status = closedForSubscriptions`
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Usar quando o edital foi avançado por engano para Avaliações de Projetos ou de Documentação
- Após o ajuste, o edital retorna para a etapa de Conclusão das Inscrições
