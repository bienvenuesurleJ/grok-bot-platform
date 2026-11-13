import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Paywall } from "@/components/ui";
import { listStrategies, runBacktest, saveStrategy } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/strategies")({ component: StrategiesPage });

type Row = Awaited<ReturnType<typeof listStrategies>>[number];

function StrategiesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    listStrategies().then(setRows).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  if (error.includes("Offre")) return <Paywall title="Stratégies" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Stratégies</h1>
      <p className="text-sm text-muted">Paramètres modifiables. Les signaux comptés viennent de la base, pas d’un rendement affiché.</p>
      {rows?.map((row) => (
        <Card key={row.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">{row.name}</h2>
              <p className="text-sm text-muted">{row.description}</p>
            </div>
            <button
              type="button"
              className="h-11 rounded-xl border border-line px-3 text-sm"
              onClick={() =>
                saveStrategy({ data: { id: row.id, enabled: !row.enabled } }).then(() =>
                  setRows((list) => list?.map((r) => (r.id === row.id ? { ...r, enabled: !r.enabled } : r)) ?? null),
                )
              }
            >
              {row.enabled ? "Active" : "Inactive"}
            </button>
          </div>
          <p className="text-xs text-muted">Risque {row.risk} · {row.signals} signal(s) enregistrés</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(row.params)
              .filter(([, v]) => typeof v === "number")
              .map(([key, value]) => (
                <label key={key} className="text-xs text-muted">
                  {key}
                  <input
                    className="num mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
                    defaultValue={Number(value)}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      saveStrategy({ data: { id: row.id, params: { [key]: n } } }).catch((err: unknown) =>
                        toast.error(err instanceof Error ? err.message : "Erreur"),
                      );
                    }}
                  />
                </label>
              ))}
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-up"
            onClick={() =>
              runBacktest({ data: { strategyId: row.id } })
                .then((res) => toast(res.message))
                .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Erreur"))
            }
          >
            Backtest sur l’historique stocké
          </button>
        </Card>
      ))}
    </div>
  );
}
