// Resume dashboard API (dashboard/ page + desktop worker in ~/career).
// Same shared key as the notes widget: x-notes-key must equal NOTES_KEY.
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/resume" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const safe = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
const DOCS = new Set(["robotics", "mech", "scholarship", "cv"]);

async function listJson(store, prefix) {
  const { blobs } = await store.list({ prefix });
  return Promise.all(blobs.map(async (b) => ({ key: b.key, ...(await store.get(b.key, { type: "json" })) })));
}

export default async (req) => {
  const key = Netlify.env.get("NOTES_KEY");
  if (!key || req.headers.get("x-notes-key") !== key) return json({ error: "unauthorized" }, 401);
  const url = new URL(req.url);
  const what = url.searchParams.get("what");
  const store = getStore({ name: "resume", consistency: "strong" });

  if (req.method === "GET" && what === "state") {
    const cards = (await listJson(store, "card/")).sort((a, b) => b.created - a.created);
    return json({
      cards,
      status: (await store.get("status", { type: "json" })) || {},
      history: (await store.get("history", { type: "json" })) || [],
      commands: await listJson(store, "cmd/"),
    });
  }
  if (req.method === "GET" && what === "cards") {
    const st = url.searchParams.get("status");
    return json((await listJson(store, "card/")).filter((c) => !st || c.status === st));
  }
  if (req.method === "POST" && what === "cards") {           // scan adds cards
    const list = await req.json();
    const out = [];
    for (const c of Array.isArray(list) ? list : [list]) {
      const card = { ...c, id: safe(c.id) || `s-${id()}`, created: Date.now(), status: c.status || "pending" };
      await store.setJSON(`card/${card.id}`, card); out.push(card);
    }
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
    return json({ key: k }, 201);
  }
  if (req.method === "GET" && what === "commands") return json(await listJson(store, "cmd/"));
  if (req.method === "DELETE" && what === "command") {
    const k = String(url.searchParams.get("key") || "");
    if (!k.startsWith("cmd/")) return json({ error: "bad key" }, 400);
    await store.delete(k); return json({ ok: true });
  }
  if (req.method === "POST" && what === "status") {          // worker/scan heartbeat, merged shallowly
    const cur = (await store.get("status", { type: "json" })) || {};
    await store.setJSON("status", { ...cur, ...(await req.json()) }); return json({ ok: true });
  }
  if (req.method === "POST" && what === "history") {
    const h = (await store.get("history", { type: "json" })) || [];
    h.unshift(await req.json()); await store.setJSON("history", h.slice(0, 200)); return json({ ok: true });
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
