// Configuração do MSAL (Microsoft Entra ID / Azure AD).
//
// ⚠️ DORMENTE: este módulo ainda NÃO é importado em lugar nenhum do app. Ele só passa a
// valer quando o login Microsoft for "ligado". Enquanto `VITE_ENTRA_CLIENT_ID` e
// `VITE_ENTRA_TENANT_ID` estiverem vazias, `isEntraConfigured` é `false` e o app continua
// usando o login atual (email/senha).
//
// Para LIGAR (quando o App registration existir e as envs estiverem preenchidas):
//   1. Envolver a aplicação no <MsalProvider> (router.tsx / __root.tsx) — Fase 1
//   2. Trocar a UI de login pelo botão "Entrar com Microsoft" — Fase 3
//   3. No retorno, pegar o idToken e chamar POST /api/auth/microsoft (broker)
// Ver docs/plano-azure-ad.md (Fases 1, 2 e 3).

import type { Configuration } from "@azure/msal-browser";

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined;
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined;
const redirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI as string | undefined;

/**
 * Porta de entrada do login Microsoft: `true` somente quando as variáveis do Entra
 * estão presentes. Use isto para decidir entre mostrar o botão Microsoft ou o login atual.
 */
export const isEntraConfigured = Boolean(clientId && tenantId);

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? "",
    authority: `https://login.microsoftonline.com/${tenantId ?? "common"}`,
    // Guarda para SSR (TanStack Start): `window` não existe no servidor.
    redirectUri:
      redirectUri ??
      (typeof window !== "undefined" ? window.location.origin : ""),
  },
  cache: {
    // Alinha com o resto do app, que usa sessionStorage para a config de conexão.
    cacheLocation: "sessionStorage",
  },
};

/** Escopos pedidos no login. `openid`/`profile`/`email` bastam para validar o ID token. */
export const loginRequest = {
  scopes: ["openid", "profile", "email"],
};
