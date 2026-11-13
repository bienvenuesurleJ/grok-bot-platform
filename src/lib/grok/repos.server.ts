import { execFile } from "node:child_process";
import { db } from "./data.server";
import { iso, num } from "./pure";

const REPOS = [
  "TauricResearch/TradingAgents",
  "sendaifun/solana-agent-kit",
  "Jackhuang166/ai-memecoin-trading-bot",
] as const;

const STALE_MS = 10 * 60_000;

type Row = {
  slug: string;
  http_status: number | null;
  state: string;
  sync: string;
  license: string | null;
  calls: number;
  last_checked: unknown;
};

export type ReferenceRepo = {
  slug: string;
  httpStatus: number | null;
  state: string;
  sync: string;
  license: string | null;
  calls: number;
  at: string | null;
  /** True only if this process executes that repository. None do. */
  executing: false;
};

async function ensure(sql: Awaited<ReturnType<typeof db>>) {
  await sql`
    create table if not exists reference_repos (
      slug text primary key,
      http_status integer,
      state text not null,
      sync text not null,
      license text,
      calls integer not null default 0,
      last_checked timestamptz
    )
  `;
  for (const slug of REPOS) {
    await sql`
      insert into reference_repos (slug, state, sync, calls)
      values (${slug}, 'en attente', 'pas encore sondé', 0)
      on conflict (slug) do nothing
    `;
  }
}

async function read(sql: Awaited<ReturnType<typeof db>>): Promise<ReferenceRepo[]> {
  const rows = await sql<Row>`
    select slug, http_status, state, sync, license, calls, last_checked
    from reference_repos
  `;
  const by = new Map(rows.map((r) => [r.slug, r]));
  return REPOS.map((slug) => {
    const row = by.get(slug);
    return {
      slug,
      httpStatus: row?.http_status == null ? null : num(row.http_status),
      state: row?.state ?? "en attente",
      sync: row?.sync ?? "pas encore sondé",
      license: row?.license ?? null,
      calls: num(row?.calls),
      at: iso(row?.last_checked),
      executing: false as const,
    };
  });
}

/** HEAD/GET the public GitHub repo. Does not clone or run third-party code. */
export async function listReferences(): Promise<ReferenceRepo[]> {
  const sql = await db();
  await ensure(sql);
  const current = await read(sql);
  const oldest = current.reduce((min, row) => {
    const t = row.at ? new Date(row.at).getTime() : 0;
    return Math.min(min, t);
  }, Date.now());
  const failed = current.some((row) => row.httpStatus == null || row.httpStatus === 0 || row.httpStatus === 403 || row.httpStatus >= 500);
  if (!failed && Date.now() - oldest < STALE_MS && current.every((row) => row.calls > 0)) return current;

  for (const slug of REPOS) {
    let status = 0;
    let state = "inactif";
    let sync = "sonde échouée";
    let license: string | null = null;
    try {
      const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        "user-agent": "grok-bot-platform",
      };
      const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetch(`https://api.github.com/repos/${slug}`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      status = res.status;
      if (res.status === 404) {
        state = "inactif";
        sync = "dépôt introuvable";
      } else if (res.ok) {
        const body = (await res.json()) as { license?: { spdx_id?: string | null } | null };
        license = body.license?.spdx_id ?? "licence non déclarée";
        state = "référence";
        sync = `${license} · code non exécuté`;
      } else if (res.status === 403 || res.status === 401) {
        const alt = await viaGh(slug);
        if (alt?.status === 404) {
          status = 404;
          state = "inactif";
          sync = "dépôt introuvable";
        } else if (alt?.status === 200) {
          status = 200;
          license = alt.license;
          state = "référence";
          sync = `${license ?? "licence non déclarée"} · code non exécuté`;
        } else {
          state = "inactif";
          sync = `GitHub ${res.status}`;
        }
      } else {
        state = "inactif";
        sync = `GitHub ${res.status}`;
      }
    } catch {
      status = 0;
      state = "inactif";
      sync = "réseau indisponible";
    }
    await sql`
      update reference_repos
      set http_status = ${status},
          state = ${state},
          sync = ${sync},
          license = ${license},
          calls = calls + 1,
          last_checked = now()
      where slug = ${slug}
    `;
  }
  return read(sql);
}

function viaGh(slug: string): Promise<{ status: number; license: string | null } | null> {
  return new Promise((resolve) => {
    execFile(
      "gh",
      ["api", `repos/${slug}`],
      { timeout: 8000 },
      (err, stdout, stderr) => {
        const text = `${stdout ?? ""}\n${stderr ?? ""}\n${err ?? ""}`;
        if (!err) {
          try {
            const body = JSON.parse(String(stdout)) as { license?: { spdx_id?: string | null } | null };
            resolve({ status: 200, license: body.license?.spdx_id ?? null });
            return;
          } catch {
            resolve(null);
            return;
          }
        }
        if (text.includes("404") || text.includes("Not Found")) {
          resolve({ status: 404, license: null });
          return;
        }
        resolve(null);
      },
    );
  });
}
