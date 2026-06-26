import { loadConfig } from "./atlas";

export interface TokenPayload {
  sub?: string;
  email?: string;
  name?: string;
  role?: string;
  exp?: number;
  [key: string]: unknown;
}

function base64urlDecode(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

export function decodeToken(): TokenPayload | null {
  const cfg = loadConfig();
  if (!cfg?.token) return null;
  try {
    const raw = JSON.parse(
      base64urlDecode(cfg.token.split(".")[1]),
    ) as Record<string, unknown>;

    // Normalize .NET long-form claim names to short aliases
    const email = (raw["email"] ??
      raw[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
      ] ??
      raw["unique_name"]) as string | undefined;

    const name = (raw["name"] ??
      raw[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
      ] ??
      raw["given_name"]) as string | undefined;

    const role = (raw["role"] ??
      raw[
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
      ]) as string | undefined;

    return { ...raw, email, name, role };
  } catch {
    return null;
  }
}

export function currentUserEmail(): string {
  return decodeToken()?.email ?? "";
}

export function currentUserName(): string {
  const t = decodeToken();
  return t?.name || t?.email || "";
}
