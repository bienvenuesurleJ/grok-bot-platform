import { useEffect, useRef, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usd, when } from "@/lib/grok/format";

export function EquityChart({ points, height = "h-56" }: { points: { t: string; equity: number }[]; height?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [color, setColor] = useState("var(--gb-up)");
  useEffect(() => {
    setReady(true);
    const value = ref.current ? getComputedStyle(ref.current).getPropertyValue("--gb-up").trim() : "";
    if (value) setColor(value);
  }, []);
  if (!ready) return <div ref={ref} className={height} />;
  if (points.length < 2) {
    return <p className="py-6 text-center text-xs text-muted">Pas assez de relevés pour tracer la courbe.</p>;
  }
  const last = points.length - 1;
  return (
    <div ref={ref} className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="t" hide />
          <YAxis
            hide
            domain={[
              (min: number) => min - Math.max(Math.abs(min) * 0.004, 1),
              (max: number) => max + Math.max(Math.abs(max) * 0.004, 1),
            ]}
          />
          <Tooltip
            formatter={(value) => usd(Number(value))}
            labelFormatter={(label) => when(String(label))}
            contentStyle={{
              background: "var(--gb-surface)",
              border: "1px solid var(--gb-line)",
              borderRadius: 12,
              color: "var(--gb-ink)",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke={color}
            fill={color}
            fillOpacity={0.14}
            strokeWidth={2}
            dot={(props) => {
              const p = props as { index?: number; cx?: number; cy?: number };
              if (p.index !== last || p.cx == null || p.cy == null) return <g key={p.index} />;
              return <circle key="last" cx={p.cx} cy={p.cy} r={4} fill={color} stroke="var(--gb-surface)" strokeWidth={2} />;
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
