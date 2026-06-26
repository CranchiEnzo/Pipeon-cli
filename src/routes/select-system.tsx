import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Shell, BrandHeader, Card } from "@/components/Shell";
import {
  loadPendingToken,
  loadSystems,
  saveSelectedSystemId,
  savePendingToken,
  loadConfig,
  clearConfig,
} from "@/lib/atlas";

export const Route = createFileRoute("/select-system")({
  head: () => ({ meta: [{ title: "Pipeon — Selecionar Sistema" }] }),
  component: SelectSystemPage,
});

function SelectSystemPage() {
  const navigate = useNavigate();
  const systems = loadSystems();

  useEffect(() => {
    const pending = loadPendingToken();
    if (!pending) {
      const cfg = loadConfig();
      if (cfg?.token) {
        savePendingToken(cfg.token);
        clearConfig();
      } else {
        navigate({ to: "/" });
      }
    }
  }, [navigate]);

  function handleSelect(systemId: string) {
    saveSelectedSystemId(systemId);
    navigate({ to: "/select-session" });
  }

  return (
    <Shell>
      <BrandHeader />
      <h2 className="mb-4 text-sm uppercase tracking-wider text-muted-foreground">
        Selecione o sistema
      </h2>

      {systems.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Nenhum sistema configurado. Acesse o{" "}
            <strong>Painel de Administração</strong> para adicionar sistemas e ambientes.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {systems.map((sys) => (
            <button key={sys.id} onClick={() => handleSelect(sys.id)} className="group text-left transition-all duration-200 hover:-translate-y-2">
              <Card className="h-full transition-all duration-200 group-hover:border-primary group-hover:shadow-[0_8px_32px_-4px] group-hover:shadow-primary/45 group-hover:bg-primary/[0.04]">
                <h3 className="text-lg font-semibold">{sys.name}</h3>
                {sys.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{sys.description}</p>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  {sys.sessions.length} ambiente(s) disponível(eis)
                </p>
              </Card>
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}
