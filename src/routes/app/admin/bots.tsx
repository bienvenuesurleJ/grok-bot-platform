import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { usd } from "@/lib/grok/format";
import { adminBots, adminPauseBot } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/admin/bots")({ component: BotsAdmin });

function BotsAdmin() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminBots>>>([]);
  const [error, setError] = useState("");
  function load() {
    adminBots().then(setRows).catch((e: unknown) => setError(e instanceof Error ? e.message : "Refusé"));
  }
  useEffect(() => { load(); }, []);
  if (error) return <p className="text-sm text-down">{error}</p>;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Bots</h1>
      <p className="text-sm text-muted">Mettre en pause stoppe les nouveaux passages de ce bureau. L’arrêt d’urgence global est sur le tableau.</p>
      {rows.map((b) => (
        <Card key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div>
            <p className="font-semibold">{b.name} · {b.mode}</p>
            <p className="text-muted">utilisateur {b.userId.slice(0, 8)}… · cash simulé {usd(b.cash)} / {usd(b.initial)}</p>
          </div>
          <button
            type="button"
            className="h-11 rounded-xl border border-line px-3"
            onClick={() => adminPauseBot({ data: { id: b.id, status: b.status === "active" ? "paused" : "active" } }).then(load)}
          >
            {b.status === "active" ? "Pause" : "Reprendre"}
          </button>
        </Card>
      ))}
    </div>
  );
}
