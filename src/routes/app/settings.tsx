import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, Paywall } from "@/components/ui";
import { getDashboard, saveRisk, setBotStatus, setEntries, setMode, type Dashboard } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/settings")({ component: SettingsPage });

function SettingsPage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getDashboard().then(setDash).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  if (!dash && !error) return <div className="h-40 animate-pulse rounded-2xl bg-line" />;
  if (!dash) return <Paywall title="Réglages" />;
  const advanced = dash.features.includes("*") || dash.features.includes("advanced_params");
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
      <Card className="space-y-3 p-4">
        <p className="text-sm">Mode du bot. Automatisé prépare la logique mais n’arme aucune clé.</p>
        <div className="flex flex-wrap gap-2">
          {(["simulation", "assisted", "automated"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`h-11 rounded-xl px-3 text-sm ${dash.bot?.mode === mode ? "bg-accent text-on-accent" : "border border-line"}`}
              onClick={() =>
                setMode({ data: { mode } })
                  .then(() => getDashboard().then(setDash))
                  .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Refusé"))
              }
            >
              {mode === "simulation" ? "Simulation" : mode === "assisted" ? "Assisté" : "Automatisé (papier)"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="h-11 rounded-xl border border-line px-3 text-sm"
          onClick={() =>
            setBotStatus({ data: { status: dash.bot?.status === "active" ? "paused" : "active" } }).then(() =>
              getDashboard().then(setDash),
            )
          }
        >
          Bot {dash.bot?.status === "active" ? "actif — mettre en pause" : "en pause — reprendre"}
        </button>
        <button
          type="button"
          className="h-11 rounded-xl border border-line px-3 text-sm"
          onClick={() => setEntries({ data: { halted: !dash.entriesHalted } }).then(() => getDashboard().then(setDash))}
        >
          {dash.entriesHalted ? "Autoriser les nouvelles entrées" : "Arrêter les nouvelles entrées"}
        </button>
      </Card>
      {advanced ? (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Limites de risque</h2>
          <RiskForm />
        </Card>
      ) : (
        <p className="text-sm text-muted">Les curseurs avancés demandent l’offre correspondante.</p>
      )}
    </div>
  );
}

function RiskForm() {
  const [form, setForm] = useState({
    maxPositionUsd: 500,
    riskPerTradeBps: 100,
    dailyLossLimit: 300,
    maxExposureUsd: 4000,
    maxOpen: 4,
    stopLossBps: 600,
    takeProfitBps: 800,
    slippageBps: 30,
    feeBps: 30,
  });
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        saveRisk({ data: form }).then(() => toast("Limites enregistrées")).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Erreur"));
      }}
    >
      {Object.entries(form).map(([key, value]) => (
        <label key={key} className="text-sm">
          {key}
          <input
            className="num mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3"
            type="number"
            value={value}
            onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <button type="submit" className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent">Enregistrer</button>
    </form>
  );
}
