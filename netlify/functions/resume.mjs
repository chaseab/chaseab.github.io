// Resume dashboard API (dashboard/ page + desktop worker in ~/career).
// Same shared key as the notes widget: x-notes-key must equal NOTES_KEY.
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/resume" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const safe = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
const DOCS = new Set(["robotics", "mech", "scholarship", "cv"]);

// Cards and commands are found through index blobs (index/card, index/cmd: arrays of keys), not
// store.list(), which has hung or failed outright on this site. A poll is one index read plus N gets.
const indexKey = (prefix) => `index/${prefix}`;
const readIndex = async (store, prefix) => (await store.get(indexKey(prefix), { type: "json" })) || [];
async function addToIndex(store, prefix, keys) {
  const cur = await readIndex(store, prefix);
  await store.setJSON(indexKey(prefix), [...new Set([...cur, ...keys])]);
}
async function removeFromIndex(store, prefix, key) {
  const cur = await readIndex(store, prefix);
  if (cur.includes(key)) await store.setJSON(indexKey(prefix), cur.filter((k) => k !== key));
}
async function listJson(store, prefix) {
  const keys = await readIndex(store, prefix);
  const got = await Promise.all(keys.map(async (k) => { const v = await store.get(k, { type: "json" }); return v && { key: k, ...v }; }));
  return got.filter(Boolean);
}
// Rebuild an index: from store.list() when it answers within 8 s, else from the keys supplied (each checked with a get).
async function reindex(store, prefix, supplied = []) {
  let keys;
  try {
    const listed = await Promise.race([store.list({ prefix: `${prefix}/` }), new Promise((_, rej) => setTimeout(() => rej(new Error("list timed out")), 8000))]);
    keys = listed.blobs.map((b) => b.key);
  } catch {
    keys = (await Promise.all(supplied.map(async (k) => ((await store.get(k)) != null ? k : null)))).filter(Boolean);
  }
  await store.setJSON(indexKey(prefix), keys);
  return keys;
}

export default async (req) => {
  const key = Netlify.env.get("NOTES_KEY");
  if (!key || req.headers.get("x-notes-key") !== key) return json({ error: "unauthorized" }, 401);
  const url = new URL(req.url);
  const what = url.searchParams.get("what");
  const store = getStore({ name: "resume", consistency: "strong" });

  if (req.method === "GET" && what === "state") {
    const cards = (await listJson(store, "card")).sort((a, b) => b.created - a.created);
    return json({
      cards,
      status: (await store.get("status", { type: "json" })) || {},
      history: (await store.get("history", { type: "json" })) || [],
      commands: await listJson(store, "cmd"),
    });
  }
  if (req.method === "GET" && what === "cards") {
    const st = url.searchParams.get("status");
    return json((await listJson(store, "card")).filter((c) => !st || c.status === st));
  }
  if (req.method === "POST" && what === "cards") {           // scan adds cards
    const list = await req.json();
    const out = [];
    for (const c of Array.isArray(list) ? list : [list]) {
      const card = { ...c, id: safe(c.id) || `s-${id()}`, created: Date.now(), status: c.status || "pending" };
      if (card.op === "add_entry" && !card.target && card.entry?.id) card.target = card.entry.id;
      await store.setJSON(`card/${card.id}`, card); out.push(card);
    }
    await addToIndex(store, "card", out.map((c) => `card/${c.id}`));
    return json(out, 201);
  }
  if (req.method === "POST" && what === "card") {            // decide / worker status update
    const b = await req.json();
    const k = `card/${safe(b.id)}`;
    const card = await store.get(k, { type: "json" });
    if (!card) return json({ error: "no card" }, 404);
    const allowed = ["status", "after", "edited", "reason", "commit"];
    for (const f of allowed) if (f in b) card[f] = b[f];
    card.updated = Date.now();
    await store.setJSON(k, card);
    return json(card);
  }
  if (req.method === "POST" && what === "command") {         // dashboard queues publish/discard/restore/scan
    const b = await req.json();
    if (!["publish", "discard", "restore", "scan", "rebuild"].includes(b.type)) return json({ error: "bad type" }, 400);
    const k = `cmd/${Date.now()}-${id()}`;
    await store.setJSON(k, { type: b.type, arg: b.arg ?? null, ts: Date.now() });
    await addToIndex(store, "cmd", [k]);
    return json({ key: k }, 201);
  }
  if (req.method === "GET" && what === "commands") return json(await listJson(store, "cmd"));
  if (req.method === "DELETE" && what === "command") {
    const k = String(url.searchParams.get("key") || "");
    if (!k.startsWith("cmd/")) return json({ error: "bad key" }, 400);
    await store.delete(k); await removeFromIndex(store, "cmd", k); return json({ ok: true });
  }
  if (req.method === "POST" && what === "reindex") {         // one-off repair: {cards?: [ids], cmds?: [keys]}
    const b = await req.json().catch(() => ({}));
    return json({
      card: await reindex(store, "card", (b.cards || []).map((x) => `card/${safe(x)}`)),
      cmd: await reindex(store, "cmd", (b.cmds || []).filter((k) => String(k).startsWith("cmd/"))),
    });
  }
  if (req.method === "POST" && what === "status") {          // worker/scan heartbeat, merged shallowly
    const cur = (await store.get("status", { type: "json" })) || {};
    await store.setJSON("status", { ...cur, ...(await req.json()) }); return json({ ok: true });
  }
  if (req.method === "POST" && what === "history") {
    const h = (await store.get("history", { type: "json" })) || [];
    h.unshift(await req.json()); await store.setJSON("history", h.slice(0, 200)); return json({ ok: true });
  }
  // Content snapshots the dashboard's redline renders from: "current" (draft, uploaded on every
  // rebuild) and "live" (uploaded on publish). GET returns both.
  if (what === "content") {
    if (req.method === "GET") return json({
      current: await store.get("content/current", { type: "json" }),
      live: await store.get("content/live", { type: "json" }),
    });
    const stage = url.searchParams.get("stage");
    if (req.method === "PUT" && ["current", "live"].includes(stage)) {
      await store.setJSON(`content/${stage}`, await req.json()); return json({ ok: true });
    }
  }
  // Clean-up from the dashboard: one card, or one history row plus its archived PDFs.
  // (The git tag stays in ~/career, so a deleted row can't be restored from the dashboard.)
  if (req.method === "DELETE" && what === "card") {
    const k = `card/${safe(url.searchParams.get("id"))}`;
    if (!(await store.get(k, { type: "json" }))) return json({ error: "no card" }, 404);
    await store.delete(k); await removeFromIndex(store, "card", k); return json({ ok: true });
  }
  if (req.method === "DELETE" && what === "history") {
    const tag = safe(url.searchParams.get("tag"));
    const h = (await store.get("history", { type: "json" })) || [];
    if (!tag || !h.some((r) => r.tag === tag)) return json({ error: "no such tag" }, 404);
    await store.setJSON("history", h.filter((r) => r.tag !== tag));
    for (const d of DOCS) await store.delete(`pdf/archive/${tag}/${d}`);
    return json({ ok: true });
  }
  if (what === "pdf") {
    const doc = safe(url.searchParams.get("doc"));
    const stage = url.searchParams.get("stage");
    const tag = safe(url.searchParams.get("tag"));
    if (!DOCS.has(doc) || !["preview", "live", "archive"].includes(stage) || (stage === "archive" && !tag))
      return json({ error: "bad pdf ref" }, 400);
    const k = stage === "archive" ? `pdf/archive/${tag}/${doc}` : `pdf/${stage}/${doc}`;
    if (req.method === "PUT") { await store.set(k, await req.arrayBuffer()); return json({ ok: true }); }
    if (req.method === "GET") {
      const buf = await store.get(k, { type: "arrayBuffer" });
      if (!buf) return json({ error: "none" }, 404);
      return new Response(buf, { headers: { "content-type": "application/pdf", "cache-control": "no-store" } });
    }
  }
  return json({ error: "bad request" }, 400);
};
