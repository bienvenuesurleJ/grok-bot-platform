import { allows, db, loadActor } from "./data.server";
import { runTick } from "./engine.server";
import { listReferences } from "./repos.server";

const g = globalThis as { __gbWorker?: boolean };

/** Ticks active desks inside this Node process. Closing the browser does not stop it. */
export function startEngineWorker() {
  if (g.__gbWorker) return;
  if (typeof window !== "undefined") return;
  g.__gbWorker = true;

  const tick = async () => {
    try {
      await listReferences();
      const sql = await db();
      const rows = await sql<{ user_id: string }>`
        select user_id from bot_instances where status = 'active' order by id asc limit 12
      `;
      for (const row of rows) {
        try {
          const actor = await loadActor(row.user_id, null);
          if (!allows(actor, "simulation")) continue;
          await runTick(actor, false);
        } catch (err) {
          console.error("[grok-engine]", row.user_id, err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      console.error("[grok-engine]", err instanceof Error ? err.message : err);
    }
  };

  const boot = setTimeout(tick, 2500);
  const loop = setInterval(tick, 60_000);
  boot.unref?.();
  loop.unref?.();
}
