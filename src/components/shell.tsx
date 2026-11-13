import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UserButton } from "@/lib/auth/gates";
import { getShell, markNotesRead, setEmergency } from "@/lib/grok/fns";
import { Mark } from "./logo";
import { Button, Pill } from "./ui";

type ShellData = Awaited<ReturnType<typeof getShell>>;

const NAV = [
  { to: "/app", label: "Tableau", exact: true },
  { to: "/app/tokens", label: "Tokens" },
  { to: "/app/scanner", label: "Scanner" },
  { to: "/app/agents", label: "Agents" },
  { to: "/app/strategies", label: "Stratégies" },
  { to: "/app/positions", label: "Positions" },
  { to: "/app/transactions", label: "Transactions" },
  { to: "/app/history", label: "Décisions" },
  { to: "/app/performance", label: "Performances" },
  { to: "/app/report", label: "Rapport" },
  { to: "/app/assistant", label: "Assistant" },
  { to: "/app/wallets", label: "Wallets" },
  { to: "/app/billing", label: "Offres" },
  { to: "/app/profile", label: "Profil" },
  { to: "/app/settings", label: "Réglages" },
] as const;

export function AppShell() {
  const [data, setData] = useState<ShellData | null>(null);
  const [dark, setDark] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    getShell()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("gb-theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="md:grid md:grid-cols-[232px_1fr]">
        <aside className="no-print sticky top-0 hidden h-screen flex-col border-r border-line bg-surface md:flex">
          <div className="flex h-16 items-center px-4">
            <Link to="/app" className="flex items-center gap-2 font-semibold">
              <Mark />
              Grok Bot
            </Link>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} label={item.label} exact={"exact" in item} />
            ))}
            {data?.owner ? <NavLink to="/app/owner" label="Propriétaire" /> : null}
            {data?.staff ? <NavLink to="/app/admin" label="Administration" /> : null}
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
            <Link to="/app" className="flex items-center gap-2 font-semibold md:hidden">
              <Mark className="h-7 w-7" />
              <span className="hidden sm:inline">Grok Bot</span>
            </Link>
            <div className="hidden items-center gap-2 md:flex">
              <Pill tone={data?.emergencyStop ? "down" : "up"}>{data?.emergencyStop ? "HALT" : "Bureau"}</Pill>
              <span className="text-sm text-muted">{data?.role ?? "…"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleTheme} className="h-11 rounded-xl px-3 text-sm text-muted">
                {dark ? "Clair" : "Sombre"}
              </button>
              {data?.staff ? (
                <Button
                  variant={data.emergencyStop ? "ghost" : "danger"}
                  disabled={stopping}
                  onClick={() => {
                    setStopping(true);
                    setEmergency({ data: { stop: !data.emergencyStop, reason: "STOP ALL" } })
                      .then(() => getShell().then(setData))
                      .finally(() => setStopping(false));
                  }}
                >
                  {data.emergencyStop ? "Lever" : "STOP"}
                </Button>
              ) : null}
              <div className="gb-user shrink-0">
              <UserButton />
            </div>
            </div>
          </header>
          {data?.emergencyStop ? (
            <div className="bg-soft-down px-4 py-2 text-sm text-down">
              Arrêt d’urgence actif. Les nouveaux achats sont bloqués. Les positions ouvertes peuvent encore être clôturées.
            </div>
          ) : null}
          {data && data.notifications.length > 0 ? (
            <div className="no-print flex items-center justify-between gap-3 border-b border-line px-4 py-2 text-sm">
              <span>{data.notifications[0]?.title}</span>
              <button
                type="button"
                className="text-muted"
                onClick={() => markNotesRead().then(() => getShell().then(setData))}
              >
                Marquer lu
              </button>
            </div>
          ) : null}
          <main className="px-4 py-5 pb-24 md:px-6 md:pb-8">
            <Outlet />
          </main>
        </div>
      </div>
      <nav className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface md:hidden">
        <Tab to="/app" label="Tableau" />
        <Tab to="/app/scanner" label="Scanner" />
        <Tab to="/app/agents" label="Agents" />
        <Tab to="/app/positions" label="Positions" />
        <Tab to="/app/more" label="Plus" />
      </nav>
    </div>
  );
}

function NavLink({ to, label, exact = false }: { to: string; label: string; exact?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const on = exact ? path === to : path === to || path.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={`flex h-10 items-center rounded-xl px-3 text-sm font-medium ${on ? "bg-soft text-up" : "text-muted"}`}
    >
      {label}
    </Link>
  );
}

function Tab({ to, label }: { to: string; label: string }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const on = to === "/app" ? path === "/app" || path === "/app/" : path.startsWith(to);
  return (
    <Link to={to} className={`flex h-14 items-center justify-center text-xs font-semibold ${on ? "text-up" : "text-muted"}`}>
      {label}
    </Link>
  );
}
