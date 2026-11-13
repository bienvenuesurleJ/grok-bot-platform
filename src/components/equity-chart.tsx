import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usd, when } from "@/lib/grok/format";

export function EquityChart({ points }: { points: { t: string; equity: number }[] }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="h-56" />;
  if (points.length < 2) {
    return <p className="py-10 text-sm text-muted">Un seul relevé pour l’instant. Le graphique se dessine au prochain passage du moteur.</p>;
  }
  const color = getComputedStyle(document.documentElement).getPropertyValue("--gb-up").trim() || "#0b7a52";
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            formatter={(value) => usd(Number(value))}
            labelFormatter={(label) => when(String(label))}
            contentStyle={{
              background: "var(--gb-surface)",
              border: "1px solid var(--gb-line)",
              borderRadius: 12,
              color: "var(--gb-ink)",
            }}
          />
          <Area type="monotone" dataKey="equity" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
