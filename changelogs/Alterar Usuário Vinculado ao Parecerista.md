# Alterar Usuário Vinculado ao Parecerista

**Núcleo:** Pareceristas
**Collection afetada:** `reviewers`

## Campos alterados

| Campo | Valor aplicado |
|-------|---------------|
| `userId` | ID do novo usuário (ObjectId) |

## Inputs necessários

| Campo | Tipo | Obrigatório | Observação |
|-------|------|------------|-----------|
| ID do Usuário Antigo | ObjectId | Sim | `_id` em `users` (filtrar por e-mail) |
| ID do Novo Usuário | ObjectId | Sim | `_id` em `users` (filtrar por e-mail) |

## Fluxo de execução

1. **Backup** — salva o(s) documento(s) de `reviewers` onde `userId = antigoUserId`
2. **updateOne** — altera `userId` para o novo usuário
3. **Changelog** — registrado em `pipeon_changelogs`

## Observações

- Obtenha os IDs dos usuários acessando a collection `users` e filtrando por e-mail
- Se o novo usuário já possuir um cadastro de parecerista, pode ser necessário
  realizar uma segunda execução trocando os IDs inversamente
- Valide no sistema se o novo login acessa corretamente o ambiente de parecerista
