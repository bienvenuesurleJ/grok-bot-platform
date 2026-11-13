import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, Paywall, Pill } from "@/components/ui";
import { when } from "@/lib/grok/format";
import { getDashboard, type Dashboard } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/agents")({ component: AgentsPage });

const COPY: Record<string, string> = {
  scanner: "Nouveaux prix, volumes, liquidité.",
  safety: "Filtre de liquidité et de variation. Pas un audit de contrat.",
  analyst: "Score de tendance à partir des variations observées.",
  risk: "Taille, stops, exposition, perte journalière.",
  executor: "Prépare ou simule. N’envoie rien on-chain.",
};

function AgentsPage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getDashboard().then(setDash).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  if (!dash && !error) return <div className="h-40 animate-pulse rounded-2xl bg-line" />;
  if (!dash) return <Paywall title="Agents" />;
  if (!dash.features.includes("*") && !dash.features.includes("agents")) return <Paywall title="Agents" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Cinq agents</h1>
      <p className="text-sm text-muted">Un agent n’est marqué ok que si son dernier passage a réellement abouti.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {dash.agents.map((a, i) => (
          <Card key={a.agent} className="p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{i + 1}. {a.agent}</p>
              <Pill tone={a.status === "ok" ? "up" : a.status === "error" ? "down" : "neutral"}>{a.status}</Pill>
            </div>
            <p className="mt-2 text-sm text-muted">{COPY[a.agent]}</p>
            <p className="mt-3 text-sm">{a.summary}</p>
            <p className="mt-2 text-xs text-muted">{when(a.at)}</p>
          </Card>
        ))}
      </div>
      {error ? <p className="text-sm text-down">{error}</p> : null}
    </div>
  );
}
