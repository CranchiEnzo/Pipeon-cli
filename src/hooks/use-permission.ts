import { decodeToken } from "@/lib/auth";
import { checkPermission, type PermissionKey } from "@/lib/permissions";

export function usePermission(key: PermissionKey): boolean {
  const token = decodeToken();
  const role = (token?.role as string) ?? "user";
  return checkPermission(role, key);
}

/** O cargo "Usuário" tem acesso apenas para visualização: pode ver as abas
 *  liberadas pelo admin, mas não pode executar, restaurar, agendar ou
 *  cancelar nada. Admin e Operador continuam com acesso total de escrita. */
export function useIsReadOnly(): boolean {
  const token = decodeToken();
  const role = ((token?.role as string) ?? "user").toLowerCase();
  return role === "user";
}
