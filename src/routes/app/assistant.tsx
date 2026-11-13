import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, Paywall } from "@/components/ui";
import { askAssistant, chatHistory } from "@/lib/grok/fns";

export const Route = createFileRoute("/app/assistant")({ component: AssistantPage });

const PROMPTS = [
  "Analyse les tokens actuellement surveillés.",
  "Explique pourquoi le bot a acheté un token.",
  "Fais-moi un rapport sur les dernières décisions.",
  "Réduis le niveau de risque.",
  "Arrête les nouvelles prises de position.",
  "Passe en mode simulation.",
];

function AssistantPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof chatHistory>>>([]);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    chatHistory().then(setRows).catch((e: unknown) => setError(e instanceof Error ? e.message : "Erreur"));
  }, []);
  if (error.includes("Offre")) return <Paywall title="Assistant" />;

  async function send(message: string) {
    const clean = message.trim();
    if (!clean || busy) return;
    setBusy(true);
    setText("");
    try {
      const res = await askAssistant({ data: { message: clean } });
      setRows((list) => [
        ...list,
        { role: "user", content: clean, source: "user", at: new Date().toISOString() },
        { role: "assistant", content: res.answer, source: res.source, at: new Date().toISOString() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
        <p className="mt-1 text-sm text-muted">
          Les ordres financiers passent par le moteur. Le modèle ne peut pas lever une limite. L’API xAI, si elle répond, est facturée sur le quota du propriétaire de l’application.
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {PROMPTS.map((p) => (
          <button key={p} type="button" className="h-10 shrink-0 rounded-full border border-line px-3 text-xs" onClick={() => void send(p)}>
            {p}
          </button>
        ))}
      </div>
      <Card className="min-h-80 space-y-3 p-4">
        {rows.length === 0 ? <p className="text-sm text-muted">Aucun échange.</p> : null}
        {rows.map((m, i) => (
          <div key={`${m.at}-${i}`} className={m.role === "user" ? "ml-8 rounded-2xl bg-bg px-3 py-2 text-sm" : "mr-8 text-sm"}>
            <p className="text-xs text-muted">{m.role === "user" ? "Vous" : m.source === "grok" ? "Grok" : "Moteur local"}</p>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </Card>
      {error && !error.includes("Offre") ? <p className="text-sm text-down">{error}</p> : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} className="h-11 flex-1 rounded-xl border border-line bg-surface px-3 text-sm" placeholder="Votre question" />
        <button type="submit" disabled={busy} className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50">
          {busy ? "…" : "Envoyer"}
        </button>
      </form>
    </div>
  );
}
