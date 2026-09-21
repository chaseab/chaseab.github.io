// Notes journal API for the portfolio's on-page notes widget (assets/js/notes.js).
// One Netlify Blob per scope: "site" for site-wide notes, or a page slug ("sma", "so101", ...).
// Every request must carry the shared key in x-notes-key (NOTES_KEY in the site's env vars).
import { getStore } from "@netlify/blobs";

export const config = { path: "/api/notes" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const scopeOf = (raw) => {
  const s = String(raw || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  return s || null;
};

export default async (req) => {
  const key = Netlify.env.get("NOTES_KEY");
  if (!key || req.headers.get("x-notes-key") !== key) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);
  const scope = scopeOf(url.searchParams.get("scope"));
  if (!scope) return json({ error: "scope required" }, 400);

  const store = getStore({ name: "notes", consistency: "strong" });
  const list = (await store.get(scope, { type: "json" })) || [];

  if (req.method === "GET") return json(list);

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").trim().slice(0, 4000);
    if (!text) return json({ error: "empty" }, 400);
    const note = {
      id: body.id && /^[a-z0-9-]{6,40}$/.test(body.id) ? body.id : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Number(body.ts) || Date.now(),
      page: scopeOf(body.page) || scope,
      text,
    };
    if (!list.some((n) => n.id === note.id)) list.push(note);
    list.sort((a, b) => a.ts - b.ts);
    await store.setJSON(scope, list);
    return json(note, 201);
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    const next = list.filter((n) => n.id !== id);
    if (next.length !== list.length) await store.setJSON(scope, next);
    return json({ ok: true, removed: list.length - next.length });
  }

  return json({ error: "method not allowed" }, 405);
};
