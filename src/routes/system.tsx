import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, BrandHeader, Card, Spinner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { fetchProjects } from "@/lib/projects";

export const Route = createFileRoute("/system")({
  head: () => ({ meta: [{ title: "Pipeon — Sistema" }] }),
  component: SystemPage,
});

function SystemPage() {
  const navigate = useNavigate();
  const [nucleos, setNucleos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects()
      .then((projects) => {
        const all = [...new Set(projects.flatMap((p) => p.nucleos ?? []))].sort();
        setNucleos(all);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/menu" />
      <BrandHeader subtitle={false} />
      <h2 className="mb-4 text-sm uppercase tracking-wider text-muted-foreground">
        Selecione o sistema
      </h2>

      {loading && (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Spinner /> Carregando…
        </div>
      )}

      {!loading && nucleos.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum núcleo cadastrado. Configure-os na aba{" "}
          <strong>Projetos</strong> do painel de administração.
        </p>
      )}

      {!loading && nucleos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {nucleos.map((nucleo) => (
            <button
              key={nucleo}
              onClick={() => navigate({ to: "/procedure", search: { nucleo } })}
              className="group text-left transition-all duration-200 hover:-translate-y-2"
            >
              <Card className="h-full transition-all duration-200 group-hover:border-primary group-hover:shadow-[0_8px_32px_-4px] group-hover:shadow-primary/45 group-hover:bg-primary/[0.04]">
                <h3 className="text-lg font-semibold">{nucleo}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Procedimentos do núcleo {nucleo}.
                </p>
              </Card>
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}
