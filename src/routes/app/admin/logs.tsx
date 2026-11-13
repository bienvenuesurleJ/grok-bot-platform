import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { when } from "@/lib/grok/format";
import { adminLogs } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/admin/logs")({ component: LogsPage });

function LogsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof adminLogs>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    adminLogs().then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : "Refusé"));
  }, []);
  if (error) return <p className="text-sm text-down">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-line" />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Journaux</h1>
      <h2 className="font-semibold">Intégrations</h2>
      {data.integrations.map((i) => (
        <Card key={i.name} className="p-4 text-sm">
          <p className="font-semibold">{i.name} · {i.status}</p>
          <p className="text-muted">{i.note}</p>
        </Card>
      ))}
      <h2 className="font-semibold">Audit</h2>
      {data.audits.map((a, i) => (
        <p key={`${a.at}-${i}`} className="text-sm"><span className="text-muted">{when(a.at)}</span> {a.action} {a.target} {a.detail}</p>
      ))}
      <h2 className="font-semibold">Erreurs agents</h2>
      {data.errors.length === 0 ? <p className="text-sm text-muted">Aucune erreur récente.</p> : null}
      {data.errors.map((e, i) => (
        <p key={`${e.at}-${i}`} className="text-sm text-down">{when(e.at)} · {e.agent} · {e.summary}</p>
      ))}
    </div>
  );
}
