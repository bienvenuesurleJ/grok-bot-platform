import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, Paywall } from "@/components/ui";
import { pct, usd, when } from "@/lib/grok/format";
import { getReport, saveNight } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/report")({ component: ReportPage });

function ReportPage() {
  const [report, setReport] = useState<Awaited<ReturnType<typeof getReport>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getReport().then(setReport).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  if (error.includes("Offre")) return <Paywall title="Rapport nocturne" />;
  if (!report) return <div className="h-40 animate-pulse rounded-2xl bg-line" />;
  const cells = [
    ["Capital de départ", report.capitalStart == null ? "aucune donnée" : usd(report.capitalStart)],
    ["Valeur finale", report.capitalEnd == null ? "aucune donnée" : usd(report.capitalEnd)],
    ["Résultat", report.pnl == null ? "aucune donnée" : usd(report.pnl)],
    ["Trades", String(report.trades)],
    ["Tokens analysés", String(report.tokens)],
    ["Meilleure vente", report.best == null ? "—" : `${report.bestSymbol ?? ""} ${usd(report.best)}`],
    ["Pire vente", report.worst == null ? "—" : `${report.worstSymbol ?? ""} ${usd(report.worst)}`],
    ["Taux de réussite", report.winRate == null ? "—" : pct(report.winRate)],
    ["Frais", usd(report.fees)],
    ["Drawdown max", report.drawdown == null ? "—" : pct(report.drawdown)],
    ["Positions ouvertes", String(report.openPositions)],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rapport nocturne</h1>
          <p className="text-sm text-muted">
            {when(report.start)} → {when(report.end)} · {report.startHour}h à {report.endHour}h, Europe/Paris
          </p>
        </div>
        <button type="button" className="no-print h-11 rounded-xl border border-line px-4 text-sm" onClick={() => window.print()}>
          Exporter
        </button>
      </div>
      <p className="text-sm text-muted">{report.note}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cells.map(([k, v]) => (
          <Card key={k} className="p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className="num mt-1 text-lg">{v}</p>
          </Card>
        ))}
      </div>
      <Card className="no-print grid gap-3 p-4 sm:grid-cols-2">
        <label className="text-sm">
          Début (heure)
          <input className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3" type="number" min={0} max={23} defaultValue={report.startHour}
            onBlur={(e) => saveNight({ data: { start: Number(e.target.value), end: report.endHour } }).then(() => getReport().then(setReport))} />
        </label>
        <label className="text-sm">
          Fin (heure)
          <input className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3" type="number" min={0} max={23} defaultValue={report.endHour}
            onBlur={(e) => saveNight({ data: { start: report.startHour, end: Number(e.target.value) } }).then(() => getReport().then(setReport))} />
        </label>
      </Card>
    </div>
  );
}
