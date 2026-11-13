import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LineChart, Radar, Scale, ShieldAlert, Zap } from "lucide-react";
import { EquityChart } from "@/components/equity-chart";
import { Mark } from "@/components/logo";
import { Paywall } from "@/components/ui";
import { hm, pct, tone, usd, usdHero, when } from "@/lib/grok/format";
import { connectWallet, getDashboard, getReport, refreshEngine, walletBalance, type Dashboard } from "@/lib/grok/fns";
import { detectWallet } from "@/lib/grok/phantom";

type Report = Awaited<ReturnType<typeof getReport>>;

const AGENTS = [
  { id: "scanner", label: "SCANNER", job: "recherche de tokens", color: "text-agent-scanner", Icon: Radar },
  { id: "safety", label: "SAFETY", job: "analyse des risques", color: "text-agent-safety", Icon: ShieldAlert },
  { id: "analyst", label: "ANALYST", job: "analyse des marchés", color: "text-agent-analyst", Icon: LineChart },
  { id: "risk", label: "RISK", job: "limites de risque", color: "text-agent-risk", Icon: Scale },
  { id: "executor", label: "EXECUTOR", job: "prépare l’exécution", color: "text-agent-executor", Icon: Zap },
] as const;

const BOOT = ["Initialisation des repositories", "Initialisation des agents"];

export function Terminal() {
  const [phase, setPhase] = useState<"boot" | "phantom" | "desk">("boot");
  const [step, setStep] = useState(0);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sol, setSol] = useState<number | null>(null);
  const [liveAddress, setLiveAddress] = useState<string | null>(null);
  const [hasPhantom, setHasPhantom] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [recap, setRecap] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    const detected = detectWallet();
    setHasPhantom(Boolean(detected));
    (async () => {
      setStep(0);
      try {
        const next = await getDashboard();
        if (cancel) return;
        setStep(1);
        await wait(450);
        if (cancel) return;
        setDash(next);
        setStep(2);
        await wait(500);
        if (cancel) return;
        const trusted = detected ? await trustedAddress(detected.provider) : null;
        if (trusted) setLiveAddress(trusted);
        const staff = next.owner || next.role === "OWNER" || next.role === "SUPER_ADMIN" || next.role === "ADMIN";
        setPhase(staff || (next.wallet && trusted) ? "desk" : "phantom");
        void refreshEngine()
          .then((res) => {
            if (!cancel) setDash(res.dash);
          })
          .catch(() => undefined);
      } catch (err) {
        if (!cancel) setError(err instanceof Error ? err.message : "Chargement impossible");
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "desk") return;
    const id = window.setInterval(() => {
      getDashboard()
        .then(setDash)
        .catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (!dash?.wallet || phase === "boot") return;
    walletBalance({ data: { address: dash.wallet.address } })
      .then((b) => setSol(b.sol))
      .catch(() => setSol(null));
  }, [dash?.wallet, phase]);

  useEffect(() => {
    if (phase !== "desk") return;
    getReport()
      .then(setReport)
      .catch(() => setReport(null));
  }, [phase, dash?.txCount]);

  if (error) return <Screen><Paywall title="Terminal indisponible" /></Screen>;
  if (phase === "boot" || !dash) return <Boot step={step} />;
  if (!dash.allowed) return <Screen><Paywall title="Grok Bot" /></Screen>;
  if (phase === "phantom") {
    return (
      <PhantomScreen
        dash={dash}
        hasPhantom={hasPhantom}
        liveAddress={liveAddress}
        sol={sol}
        connecting={connecting}
        connectError={connectError}
        onConnected={(address) => {
          setLiveAddress(address);
          setPhase("desk");
        }}
        onContinue={() => (walletOpen ? setWalletOpen(false) : setPhase("desk"))}
        dismissLabel={walletOpen ? "Retour à l’espace" : "Continuer en simulation, sans wallet"}
        onConnect={async () => {
          const detected = detectWallet();
          setHasPhantom(Boolean(detected));
          if (!detected || detected.name !== "Phantom") {
            setConnectError("Phantom n’est pas injecté dans ce navigateur. CONNECTED n’est pas affiché.");
            return;
          }
          setConnecting(true);
          setConnectError("");
          try {
            const res = await detected.provider.connect();
            const pub = res.publicKey.toString();
            await connectWallet({ data: { address: pub, name: "Phantom" } });
            const bal = await walletBalance({ data: { address: pub } });
            setSol(bal.sol);
            setLiveAddress(pub);
            const next = await getDashboard();
            setDash(next);
          } catch (err) {
            setLiveAddress(null);
            setConnectError(err instanceof Error ? err.message : "Connexion Phantom refusée");
          } finally {
            setConnecting(false);
          }
        }}
      />
    );
  }

  return (
    <>
      <Desk
        dash={dash}
        report={report}
        sol={sol}
        liveAddress={liveAddress}
        recap={recap}
        setRecap={setRecap}
        onOpenWallet={() => {
          setConnectError("");
          setWalletOpen(true);
        }}
      />
      {walletOpen ? (
        <div className="fixed inset-0 z-40 overflow-auto bg-surface">
          <PhantomScreen
            dash={dash}
            hasPhantom={hasPhantom}
            liveAddress={liveAddress}
            sol={sol}
            connecting={connecting}
            connectError={connectError}
            dismissLabel="Retour à l’espace"
            onConnected={() => setWalletOpen(false)}
            onContinue={() => setWalletOpen(false)}
            onConnect={async () => {
              const detected = detectWallet();
              setHasPhantom(Boolean(detected));
              if (!detected || detected.name !== "Phantom") {
                setConnectError("Phantom n’est pas injecté dans ce navigateur. CONNECTED n’est pas affiché.");
                return;
              }
              setConnecting(true);
              setConnectError("");
              try {
                const res = await detected.provider.connect();
                const pub = res.publicKey.toString();
                await connectWallet({ data: { address: pub, name: "Phantom" } });
                const bal = await walletBalance({ data: { address: pub } });
                setSol(bal.sol);
                setLiveAddress(pub);
                setDash(await getDashboard());
                setWalletOpen(false);
              } catch (err) {
                setLiveAddress(null);
                setConnectError(err instanceof Error ? err.message : "Connexion Phantom refusée");
              } finally {
                setConnecting(false);
              }
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function Boot({ step }: { step: number }) {
  return (
    <Screen>
      <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
        <Mark className="h-16 w-16" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Grok Bot</h1>
        <p className="mt-1 text-sm text-muted">terminal / meme mode</p>
        <div className="gb-spin mt-8 h-6 w-6 rounded-full border-2 border-line border-t-accent" />
        <ul className="mt-8 w-full max-w-xs space-y-2 text-left text-sm">
          {BOOT.map((label, i) => (
            <li key={label} className={i <= step ? "text-ink" : "text-muted"}>
              <span className="num mr-2 text-xs text-muted">0{i + 1}</span>
              {label}
              {i < step ? <span className="float-right text-up">ok</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </Screen>
  );
}

function PhantomScreen({
  dash,
  hasPhantom,
  liveAddress,
  sol,
  connecting,
  connectError,
  onConnect,
  onConnected,
  onContinue,
  dismissLabel,
}: {
  dash: Dashboard;
  hasPhantom: boolean;
  liveAddress: string | null;
  sol: number | null;
  connecting: boolean;
  connectError: string;
  onConnect: () => Promise<void>;
  onConnected: (address: string) => void;
  onContinue: () => void;
  dismissLabel: string;
}) {
  const connected = Boolean(liveAddress);
  return (
    <Screen>
      <div className="flex min-h-screen flex-col px-6 py-10">
        <div className="flex items-center justify-center gap-4">
          <Mark className="h-12 w-12" />
          <PhantomMark />
        </div>
        <h1 className="mt-8 text-center text-2xl font-semibold tracking-tight">Connect Phantom</h1>
        <p className="mt-1 text-center text-sm text-muted">Solana</p>
        <div className="mt-8 rounded-2xl border border-line px-4 py-3 text-sm">
          <p className="text-xs text-muted">Wallet</p>
          <p className="mt-1 font-medium">{connected ? "Phantom" : "Aucun wallet connecté"}</p>
          <p className="num mt-2 break-all text-xs">{liveAddress ?? dash.wallet?.address ?? "—"}</p>
          <p className="mt-2 text-xs text-muted">
            Solde réel : {sol == null ? (connected || dash.wallet ? "lecture…" : "indisponible sans connexion") : `${sol.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} SOL`}
          </p>
        </div>
        <ul className="mt-6 space-y-3 text-sm">
          <li>View balance and activity.</li>
          <li>Request approval for transactions.</li>
          <li>Can’t move funds without your approval.</li>
        </ul>
        {connectError ? <p className="mt-4 text-sm text-down">{connectError}</p> : null}
        {!hasPhantom ? (
          <p className="mt-4 text-sm text-muted">Phantom n’est pas disponible ici. Le bouton CONNECTED reste masqué.</p>
        ) : null}
        {connected ? (
          <button
            type="button"
            className="mt-8 h-12 w-full rounded-xl bg-accent text-sm font-semibold text-on-accent"
            onClick={() => onConnected(liveAddress!)}
          >
            CONNECTED
          </button>
        ) : (
          <button
            type="button"
            disabled={connecting || !hasPhantom}
            className="mt-8 h-12 w-full rounded-xl bg-ink text-sm font-semibold text-bg disabled:opacity-40"
            onClick={() => void onConnect()}
          >
            {connecting ? "Connexion…" : "Connecter Phantom"}
          </button>
        )}
        <button type="button" className="mt-3 h-11 text-sm text-muted" onClick={onContinue}>
          {dismissLabel}
        </button>
      </div>
    </Screen>
  );
}

function Desk({
  dash,
  report,
  sol,
  liveAddress,
  recap,
  setRecap,
  onOpenWallet,
}: {
  dash: Dashboard;
  report: Report | null;
  sol: number | null;
  liveAddress: string | null;
  recap: boolean;
  setRecap: (v: boolean) => void;
  onOpenWallet: () => void;
}) {
  const mult = dash.initial > 0 ? dash.equity / dash.initial : null;
  const points = dash.series.length === 1 ? [dash.series[0]!, { ...dash.series[0]!, t: dash.series[0]!.t }] : dash.series;
  const walletOn = Boolean(liveAddress);
  return (
    <Screen>
      <div className="px-4 pb-8 pt-4">
        <header className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Mark className="h-8 w-8" />
            <div>
              <p className="text-sm font-semibold leading-none">Grok Bot</p>
              <p className="mt-1 text-xs text-muted">meme mode</p>
            </div>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1.5 text-xs font-semibold">
              <span className={`h-2 w-2 rounded-full ${dash.live === "LIVE" ? "bg-up" : dash.live === "HALT" ? "bg-down" : "bg-line"}`} />
              {dash.live}
            </p>
            <button type="button" className="mt-1 text-xs text-muted" onClick={onOpenWallet}>
              {walletOn ? "Gérer le wallet" : "Ajouter un wallet"}
            </button>
            {walletOn && sol != null ? <p className="num text-xs">{sol.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} SOL</p> : null}
          </div>
        </header>

        <div className="mt-4 overflow-hidden border-y border-line">
          {dash.marketError ? (
            <p className="py-2 text-xs text-down">Prix indisponibles : {dash.marketError}. Aucun cours inventé.</p>
          ) : dash.markets.length === 0 ? (
            <p className="py-2 text-xs text-muted">Aucun prix DexScreener.</p>
          ) : (
            <div className="gb-ticker flex w-max gap-5 py-2">
              {[...dash.markets, ...dash.markets].map((m, i) => (
                <span key={`${m.address}-${i}`} className="flex items-baseline gap-2 text-xs">
                  <span className="font-semibold">{m.symbol}</span>
                  <span className="num">{usd(m.priceUsd, m.priceUsd >= 1 ? 2 : 4)}</span>
                  <span className={`num ${tone(m.changeH24)}`}>{pct(m.changeH24)}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${m.changeH24 < 0 ? "bg-down" : "bg-up"}`} />
                </span>
              ))}
            </div>
          )}
        </div>

        <p className="num mt-5 text-5xl font-medium tracking-tight text-ink">{usdHero(dash.equity)}</p>
        <p className="mt-1 text-sm text-muted">valeur actuelle du portefeuille {dash.bot?.mode === "simulation" ? "simulé" : dash.bot?.mode}</p>
        <p className={`num mt-1 text-sm font-medium ${tone(dash.pnl)}`}>
          {dash.pnl > 0 ? "+" : ""}
          {usd(dash.pnl)}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted">Capital initial</dt>
            <dd className="num mt-0.5 font-medium">{usdHero(dash.initial)}</dd>
          </div>
          <div>
            <dt className="text-muted">Trades</dt>
            <dd className="num mt-0.5 font-medium">{dash.txCount}</dd>
          </div>
          <div>
            <dt className="text-muted">Multiplicateur</dt>
            <dd className={`num mt-0.5 font-medium ${mult != null && mult > 1 ? "text-up" : mult != null && mult < 1 ? "text-down" : ""}`}>
              {mult == null ? "—" : formatMult(mult)}
            </dd>
          </div>
        </dl>

        <div className="mt-3">
          <EquityChart points={points} height="h-36" />
        </div>

        {dash.entriesHalted || dash.emergencyStop ? (
          <p className="text-xs text-down">Arrêt des nouveaux achats. Les sorties restent possibles.</p>
        ) : null}

        <section className="mt-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted">Repositories</h2>
          <div className="mt-2 space-y-2">
            {(dash.repos.length ? dash.repos : []).map((repo) => (
              <article key={repo.slug} className="rounded-xl border border-line px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-semibold">{repo.slug}</p>
                  <p className="shrink-0 text-xs">{repo.state}</p>
                </div>
                <p className="mt-1 flex justify-between text-xs text-muted">
                  <span className="num">{repo.calls} {repo.calls > 1 ? "sondes" : "sonde"}</span>
                  <span>{when(repo.at)}</span>
                </p>
                <p className="text-xs text-muted">{repo.sync}</p>
              </article>
            ))}
            {dash.repos.length === 0 ? <p className="text-xs text-muted">Sonde des dépôts indisponible. Aucun n’est marqué actif.</p> : null}
          </div>
        </section>

        <section className="mt-5">
          <h2 className="text-xs font-semibold tracking-wide">AGENTS · WORKING ON REPOS</h2>
          <ul className="mt-1">
            {AGENTS.map((meta) => {
              const row = dash.agents.find((a) => a.agent === meta.id);
              return (
                <li key={meta.id} className="flex items-start gap-2 border-b border-line py-2">
                  <meta.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-xs font-semibold tracking-wide ${meta.color}`}>{meta.label}</span>
                      <span className="num text-xs font-medium">{row?.symbol ?? "—"}</span>
                    </div>
                    <p className="truncate text-xs text-muted">{row?.summary ?? meta.job}</p>
                  </div>
                  <div className="w-16 shrink-0 text-right">
                    <p className="text-xs font-medium">{row?.status ?? "idle"}</p>
                    <p className="num text-xs text-muted">{hm(row?.at ?? null)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide">GROK CORE · DECISIONS</h2>
            <span className="flex items-center gap-1 text-xs text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${dash.live === "LIVE" ? "bg-up" : "bg-line"}`} />
              {dash.live === "LIVE" ? "sync" : "en attente"}
            </span>
          </div>
          <ul className="mt-1">
            {dash.decisions.length === 0 ? <li className="py-3 text-xs text-muted">Aucune décision enregistrée.</li> : null}
            {dash.decisions.map((d) => (
              <li key={d.id} className="border-b border-line py-2">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="num text-muted">{hm(d.at)}</span>
                  <span className={`font-semibold ${d.action === "BUY" ? "text-up" : d.action === "SELL" ? "text-down" : "text-ink"}`}>{d.action}</span>
                  <span className="font-semibold">{d.symbol ?? "—"}</span>
                  <span className="num text-muted">{d.size == null ? "—" : usd(d.size)}</span>
                  <span className="ml-auto uppercase text-muted">{d.agent}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">{d.result ? `${d.result} · ` : ""}{d.reason}</p>
              </li>
            ))}
          </ul>
        </section>

        <button type="button" className="mt-5 h-11 w-full rounded-xl border border-line text-sm font-semibold" onClick={() => setRecap(true)}>
          Night recap
        </button>
        <Link to="/app/more" className="mt-3 block text-center text-xs text-muted">
          Bureau · offres, admin, réglages
        </Link>
        <p className="mt-3 text-center text-xs leading-4 text-muted">
          Les trades affichés sont simulés tant qu’aucune signature Solana n’est enregistrée. Le moteur continue dans le processus serveur après la fermeture de cette page.
        </p>
      </div>
      {recap ? <NightRecap dash={dash} report={report} onClose={() => setRecap(false)} /> : null}
    </Screen>
  );
}

function NightRecap({ dash, report, onClose }: { dash: Dashboard; report: Report | null; onClose: () => void }) {
  const nightHasBook = report != null && report.trades > 0 && report.capitalStart != null && report.capitalEnd != null;
  const end = nightHasBook ? report!.capitalEnd : dash.equity;
  const start = nightHasBook ? report!.capitalStart : dash.initial;
  const mult = start && start > 0 && end != null ? end / start : dash.initial > 0 ? dash.equity / dash.initial : null;
  const rows: [string, string][] = [
    ["Capital initial", start == null ? "—" : usdHero(start)],
    ["Valeur finale", end == null ? "—" : usdHero(end)],
    ["Multiplicateur", mult == null ? "—" : formatMult(mult)],
    ["Trades", String(nightHasBook ? report!.trades : dash.txCount)],
    ["Tokens", nightHasBook ? String(report!.tokens) : "—"],
    ["Positions", String(nightHasBook ? report!.openPositions : dash.openPositions)],
    ["Agents", "5"],
    ["Meilleure", nightHasBook && report!.best != null ? `${report!.bestSymbol ?? ""} ${usd(report!.best)}` : "aucune clôture"],
    ["Pire", nightHasBook && report!.worst != null ? `${report!.worstSymbol ?? ""} ${usd(report!.worst)}` : "aucune clôture"],
  ];
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 p-3 sm:items-center">
      <div className="w-full max-w-[430px] rounded-2xl bg-surface p-5 shadow-lg">
        <h2 className="text-lg font-semibold tracking-tight">Night recap</h2>
        <p className="mt-1 text-xs text-muted">
          {nightHasBook
            ? "Fenêtre de nuit : exécutions et relevés stockés."
            : "La fenêtre de nuit n’a pas encore de clôture. Chiffres de la session en cours, pas une performance inventée."}
        </p>
        <dl className="mt-4 space-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="num text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <Link to="/app/report" className="mt-5 flex h-11 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-on-accent">
          Tableau détaillé
        </Link>
        <button type="button" className="mt-2 h-11 w-full text-sm text-muted" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="gb-terminal min-h-screen">
      <div className="mx-auto min-h-screen w-full max-w-[430px] bg-surface md:my-4 md:min-h-[calc(100vh-2rem)] md:rounded-[28px] md:border md:border-line md:shadow-sm">
        {children}
      </div>
    </div>
  );
}

function PhantomMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-12 w-12 text-phantom" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M9 14.5c.2-3.4 2.6-6 7-6s6.8 2.6 7 6V22h-2.4l-1.3-2.2h-.2L17.8 22h-3.6l-1.3-2.2h-.2L11.4 22H9v-7.5z"
        fill="var(--gb-surface)"
      />
      <circle cx="13" cy="15" r="1" className="fill-ink" />
      <circle cx="19" cy="15" r="1" className="fill-ink" />
    </svg>
  );
}

function formatMult(m: number) {
  const digits = Math.abs(m - 1) < 0.01 ? 4 : 2;
  return `×${m.toFixed(digits)}`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function trustedAddress(provider: NonNullable<ReturnType<typeof detectWallet>>["provider"]) {
  try {
    if (provider.publicKey && provider.isConnected) return provider.publicKey.toString();
    const res = await provider.connect({ onlyIfTrusted: true });
    return res.publicKey.toString();
  } catch {
    return null;
  }
}
