import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui";
import { adminClients, adminGrant, adminSetClient, listPlans } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/admin/clients")({ component: ClientsPage });

function ClientsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof adminClients>>>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof listPlans>>>([]);
  const [error, setError] = useState("");
  function load() {
    adminClients().then(setRows).catch((e: unknown) => setError(e instanceof Error ? e.message : "Refusé"));
  }
  useEffect(() => {
    load();
    listPlans().then(setPlans).catch(() => undefined);
  }, []);
  if (error) return <p className="text-sm text-down">{error}</p>;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
      {rows.map((c) => (
        <Card key={c.id} className="space-y-2 p-4 text-sm">
          <p className="font-semibold">{c.name || "Sans nom"} · {c.role}</p>
          <p className="text-muted">{c.email ?? "e-mail non synchronisé"} · {c.status}</p>
          <div className="flex flex-wrap gap-2">
            {c.role !== "OWNER" ? (
              <>
                <button type="button" className="h-10 rounded-xl border border-line px-3" onClick={() => adminSetClient({ data: { userId: c.id, status: c.status === "active" ? "suspended" : "active" } }).then(load).catch((e: unknown) => toast.error(String(e)))}>
                  {c.status === "active" ? "Suspendre" : "Réactiver"}
                </button>
                <button type="button" className="h-10 rounded-xl border border-line px-3" onClick={() => adminSetClient({ data: { userId: c.id, role: c.role === "ADMIN" ? "CLIENT" : "ADMIN" } }).then(load).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Refusé"))}>
                  {c.role === "ADMIN" ? "Repasser client" : "Nommer admin"}
                </button>
              </>
            ) : <span className="text-muted">Propriétaire non modifiable</span>}
            <select
              className="h-10 rounded-xl border border-line bg-surface px-2"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                adminGrant({ data: { userId: c.id, planId: e.target.value, days: 30 } })
                  .then(() => toast("Accès accordé, sans paiement"))
                  .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Erreur"));
              }}
            >
              <option value="">Accorder une offre 30 j</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
          </div>
        </Card>
      ))}
    </div>
  );
}
