import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, Paywall, Pill } from "@/components/ui";
import { when } from "@/lib/grok/format";
import { listDecisions } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/scanner")({ component: ScannerPage });

function ScannerPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listDecisions>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    listDecisions({ data: { filter: "all" } })
      .then((all) => setRows(all.filter((r) => r.agent === "scanner" || r.agent === "safety")))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  if (error.includes("Offre")) return <Paywall title="Scanner" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Scanner</h1>
      <p className="max-w-2xl text-sm text-muted">
        Le scanner lit les paires DexScreener. Safety bloque selon la liquidité, le volume et la variation.
        Ce n’est pas une détection honeypot on-chain.
      </p>
      {error && !error.includes("Offre") ? <p className="text-sm text-down">{error}</p> : null}
      {!rows ? <div className="h-32 animate-pulse rounded-2xl bg-line" /> : null}
      <div className="space-y-2">
        {rows?.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-semibold">
                {r.agent} · {r.symbol ?? "marché"}
              </p>
              <p className="text-sm text-muted">{r.reason}</p>
            </div>
            <div className="text-right">
              <Pill tone={r.action === "BLOCK" ? "down" : "up"}>{r.action}</Pill>
              <p className="mt-1 text-xs text-muted">{when(r.at)}</p>
            </div>
          </Card>
        ))}
        {rows && rows.length === 0 ? <p className="text-sm text-muted">Aucun scan. Ouvrez le tableau pour lancer le moteur.</p> : null}
      </div>
    </div>
  );
}
