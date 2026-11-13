import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, Paywall } from "@/components/ui";
import { usd, when } from "@/lib/grok/format";
import { listDecisions } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/history")({ component: HistoryPage });

const FILTERS = [
  ["all", "Tous"],
  ["buy", "Achats"],
  ["sell", "Ventes"],
  ["alert", "Alertes"],
  ["error", "Erreurs"],
  ["confirmed", "Confirmées"],
] as const;

function HistoryPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listDecisions>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    listDecisions({ data: { filter } })
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [filter]);
  if (error.includes("Offre")) return <Paywall title="Historique" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Décisions</h1>
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} className={`h-10 shrink-0 rounded-full px-3 text-sm ${filter === id ? "bg-ink text-bg" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>
      {rows?.map((r) => (
        <Card key={r.id} className="p-4 text-sm">
          <div className="flex justify-between gap-3">
            <p className="font-semibold">{when(r.at)} · {r.action} {r.symbol ?? ""}</p>
            <p className="text-muted">{r.agent}</p>
          </div>
          <p className="mt-1 text-muted">{r.reason}</p>
          <p className="num mt-2 text-xs text-muted">
            {r.price == null ? "prix non applicable" : usd(r.price, r.price >= 1 ? 2 : 6)}
            {r.size ? ` · taille ${usd(r.size)}` : ""} · {r.result ?? "—"}
            {r.signature ? ` · ${r.signature}` : " · pas de signature"}
          </p>
        </Card>
      ))}
    </div>
  );
}
