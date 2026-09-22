/* notes.js — Chase's on-page notes journal.
   A chat-style panel, bottom right, with two streams: notes for this page and notes for the whole site.
   The launcher is standard on temp sites (*.netlify.app previews, localhost) and hidden on production until
   the device is unlocked (or ?notes is added). Notes are behind a shared key entered once per device (kept in
   a cookie and localStorage). Notes live in Netlify Blobs via /api/notes and are cached
   in localStorage so they show instantly and survive being offline. Include with
   <script src="assets/js/notes.js" defer></script> (adjust the path per folder). No dependencies. */
(() => {
  const KEY = "cb-notes-key", UI = "cb-notes-ui", CACHE = "cb-notes-cache:", PENDING = "cb-notes-pending";
  const slug = (location.pathname.replace(/\/index\.html$|\.html$|\/$/g, "").split("/").filter(Boolean).pop() || "home")
    .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "home";
  const title = (document.querySelector("h1")?.textContent || document.title).trim().replace(/\s+/g, " ").slice(0, 60);

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const wantsUnlock = /[?&#]notes\b/.test(location.search + location.hash);
  const cookie = {
    get() { const m = document.cookie.match(/(?:^|; )cb_notes_key=([^;]*)/); return m ? decodeURIComponent(m[1]) : null; },
    set(v) { document.cookie = `cb_notes_key=${encodeURIComponent(v)}; max-age=31536000; path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; },
    del() { document.cookie = "cb_notes_key=; max-age=0; path=/"; },
  };
  let key = ls.get(KEY, null) || cookie.get();
  if (key) { ls.set(KEY, key); cookie.set(key); }
  // The launcher is standard on temp sites (Netlify previews, local); on production it only shows once unlocked.
  const isTemp = /\.netlify\.app$/i.test(location.hostname) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (!key && !wantsUnlock && !isTemp) return;

  // ---------- styles ----------
  const css = `
  .cbn-launch{position:fixed;right:18px;bottom:18px;z-index:9000;width:46px;height:46px;border:1px solid #1c2e4a;background:#1c2e4a;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,.18);font:600 13px "Source Sans Pro",system-ui,sans-serif}
  .cbn-launch svg{width:22px;height:22px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .cbn-launch .cbn-badge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;background:#ff8882;color:#1c2e4a;font-size:11px;font-weight:700;line-height:18px;text-align:center}
  .cbn{position:fixed;right:18px;bottom:18px;z-index:9001;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 36px));display:flex;flex-direction:column;background:#fff;border:1px solid rgba(0,0,0,.2);box-shadow:0 12px 40px rgba(0,0,0,.22);font:15px/1.5 "Source Sans Pro",system-ui,sans-serif;color:#212529}
  .cbn[hidden],.cbn-launch[hidden]{display:none}
  .cbn[data-mode="expanded"]{width:min(680px,calc(100vw - 24px));height:min(84vh,calc(100vh - 36px))}
  .cbn[data-mode="min"]{height:auto}
  .cbn[data-mode="min"] .cbn-body,.cbn[data-mode="min"] .cbn-compose,.cbn[data-mode="min"] .cbn-tabs{display:none}
  .cbn-head{display:flex;align-items:center;gap:8px;padding:10px 10px 10px 14px;background:#1c2e4a;color:#fff}
  .cbn-head b{font-size:15px;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cbn-head small{font-weight:400;opacity:.7;margin-left:6px}
  .cbn-ib{width:28px;height:28px;border:0;background:transparent;color:#fff;cursor:pointer;opacity:.8;display:flex;align-items:center;justify-content:center}
  .cbn-ib:hover{opacity:1;background:rgba(255,255,255,.12)}
  .cbn-ib svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
  .cbn-tabs{display:flex;border-bottom:1px solid #dee2e6;background:#f8f9fa}
  .cbn-tab{flex:1;padding:9px 6px;border:0;border-bottom:2px solid transparent;background:transparent;font:600 13px "Source Sans Pro",system-ui,sans-serif;color:#6c757d;cursor:pointer}
  .cbn-tab[aria-selected="true"]{color:#1c2e4a;border-bottom-color:#1c2e4a;background:#fff}
  .cbn-tab .n{font-weight:400;opacity:.7;margin-left:4px}
  .cbn-body{flex:1;overflow-y:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:10px;background:#fff}
  .cbn-empty{margin:auto;text-align:center;color:#6c757d;font-size:14px;max-width:26ch}
  .cbn-msg{position:relative;max-width:92%;align-self:flex-start;background:#f1f3f5;border:1px solid #e5e8eb;padding:9px 12px 7px;font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}
  .cbn-msg a{color:#1c2e4a}
  .cbn-msg .cbn-meta{display:flex;gap:8px;align-items:center;margin-top:5px;font-size:12px;color:#6c757d;white-space:nowrap}
  .cbn-msg .cbn-chip{background:#eaf0fc;color:#1c2e4a;padding:0 6px;font-weight:600}
  .cbn-msg .cbn-pend{color:#81303a}
  .cbn-del{position:absolute;top:4px;right:4px;border:0;background:transparent;color:#6c757d;font:600 12px "Source Sans Pro",system-ui,sans-serif;cursor:pointer;padding:2px 6px;opacity:0}
  .cbn-msg:hover .cbn-del,.cbn-del:focus,.cbn-del.arm{opacity:1}
  .cbn-del.arm{background:#81303a;color:#fff}
  .cbn-compose{display:flex;gap:8px;align-items:flex-end;padding:10px 12px 12px;border-top:1px solid #dee2e6;background:#fff}
  .cbn-ta{flex:1;resize:none;min-height:40px;max-height:160px;padding:9px 11px;border:1px solid rgba(0,0,0,.2);font:15px/1.45 "Source Sans Pro",system-ui,sans-serif;color:#212529;background:#fff;outline:none}
  .cbn-ta:focus{border-color:#1c2e4a}
  .cbn-send{width:40px;height:40px;border:1px solid #1c2e4a;background:#1c2e4a;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none}
  .cbn-send:disabled{opacity:.4;cursor:default}
  .cbn-send svg{width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .cbn-foot{padding:0 14px 8px;font-size:12px;color:#6c757d;display:flex;justify-content:space-between;gap:8px}
  .cbn-foot .bad{color:#81303a}
  .cbn-lock{padding:22px 18px;display:flex;flex-direction:column;gap:10px;font-size:14px;color:#495057}
  .cbn-lock input{padding:9px 11px;border:1px solid rgba(0,0,0,.2);font:15px "Source Sans Pro",system-ui,sans-serif}
  .cbn-lock button{align-self:flex-start;padding:8px 18px;border:1px solid #1c2e4a;background:#1c2e4a;color:#fff;font:600 13px "Source Sans Pro",system-ui,sans-serif;cursor:pointer}
  @media (max-width:640px){.cbn{right:8px;bottom:8px;width:calc(100vw - 16px);height:min(72vh,calc(100vh - 16px))}.cbn-launch{right:12px;bottom:12px}}
  @media (prefers-reduced-motion:no-preference){.cbn-msg{animation:cbn-in .16s ease}@keyframes cbn-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  // ---------- state ----------
  const ui = Object.assign({ mode: "closed", tab: "page" }, ls.get(UI, {}));
  const cache = (scope) => ls.get(CACHE + scope, []);
  const setCache = (scope, list) => ls.set(CACHE + scope, list);
  let status = "";

  // ---------- api ----------
  const api = async (method, scope, body, id) => {
    const q = new URLSearchParams({ scope }); if (id) q.set("id", id);
    const res = await fetch(`/api/notes?${q}`, { method, headers: { "x-notes-key": key || "", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) { throw Object.assign(new Error("unauthorized"), { unauthorized: true }); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  const flushPending = async () => {
    const pend = ls.get(PENDING, []); if (!pend.length) return;
    const left = [];
    for (const p of pend) { try { await api("POST", p.scope, p); } catch (e) { if (e.unauthorized) throw e; left.push(p); } }
    ls.set(PENDING, left);
  };
  const load = async (scope) => {
    try { await flushPending(); const list = await api("GET", scope); setCache(scope, list); status = ""; return list; }
    catch (e) { if (e.unauthorized) { lock(); throw e; } status = "offline — showing what's saved on this device"; return cache(scope); }
  };

  // ---------- dom ----------
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const icon = {
    pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5l3 3"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M5 12h13"/><path d="M12 5l7 7-7 7"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    min: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 15v5h-5M20 9V4h-5M4 15v5h5"/></svg>',
    shrink: '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 20v-5h5M15 4v5h5M9 20v-5H4"/></svg>',
  };
  const launch = el("button", "cbn-launch", icon.pen); launch.title = "Notes (Ctrl+.)"; launch.setAttribute("aria-label", "Open notes");
  const badge = el("span", "cbn-badge"); badge.hidden = true; launch.appendChild(badge);
  const panel = el("div", "cbn"); panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Notes journal");
  const head = el("div", "cbn-head");
  const headTitle = el("b", null, `Notes <small>${title}</small>`);
  const bMin = el("button", "cbn-ib", icon.min), bExp = el("button", "cbn-ib", icon.expand), bClose = el("button", "cbn-ib", icon.close);
  bMin.title = "Minimize"; bExp.title = "Expand"; bClose.title = "Hide";
  head.append(headTitle, bMin, bExp, bClose);
  const tabs = el("div", "cbn-tabs"); tabs.setAttribute("role", "tablist");
  const tabPage = el("button", "cbn-tab", `This page<span class="n"></span>`), tabSite = el("button", "cbn-tab", `Site-wide<span class="n"></span>`);
  tabPage.setAttribute("role", "tab"); tabSite.setAttribute("role", "tab"); tabs.append(tabPage, tabSite);
  const body = el("div", "cbn-body");
  const foot = el("div", "cbn-foot");
  const compose = el("div", "cbn-compose");
  const ta = el("textarea", "cbn-ta"); ta.rows = 1; ta.setAttribute("aria-label", "New note");
  // an unsent draft follows you from page to page (Chase, 22 Sep)
  const DRAFT = "cbn:draft";
  try { ta.value = ls.get(DRAFT, "") || ""; } catch {}
  ta.addEventListener("input", () => { ls.set(DRAFT, ta.value); });
  const send = el("button", "cbn-send", icon.send); send.title = "Save note (Enter)"; send.disabled = true;
  compose.append(ta, send);
  if (ta.value.trim()) { send.disabled = false; ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; }
  panel.append(head, tabs, body, foot, compose);
  document.body.append(launch, panel);

  const fmt = (ts) => {
    const d = new Date(ts), now = new Date();
    const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const same = d.toDateString() === now.toDateString();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (same) return `Today ${t}`; if (d.toDateString() === y.toDateString()) return `Yesterday ${t}`;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" })}, ${t}`;
  };
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const linkify = (s) => esc(s).replace(/\bhttps?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

  const scope = () => (ui.tab === "site" ? "site" : slug);
  const render = (list) => {
    body.innerHTML = "";
    if (!list.length) { body.append(el("div", "cbn-empty", ui.tab === "site" ? "No site-wide notes yet. Things that apply to every page go here." : `No notes on this page yet.`)); }
    for (const n of list) {
      const m = el("div", "cbn-msg", linkify(n.text));
      const meta = el("div", "cbn-meta", `<span>${fmt(n.ts)}</span>${ui.tab === "site" && n.page && n.page !== "site" ? `<span class="cbn-chip">${esc(n.page)}</span>` : ""}${n.pending ? `<span class="cbn-pend">not synced</span>` : ""}`);
      const del = el("button", "cbn-del", "×"); del.title = "Delete";
      let arm; del.onclick = async () => {
        if (!del.classList.contains("arm")) { del.classList.add("arm"); del.textContent = "delete?"; arm = setTimeout(() => { del.classList.remove("arm"); del.textContent = "×"; }, 3000); return; }
        clearTimeout(arm); m.remove();
        const sc = scope(); setCache(sc, cache(sc).filter((x) => x.id !== n.id)); ls.set(PENDING, ls.get(PENDING, []).filter((x) => x.id !== n.id));
        try { await api("DELETE", sc, null, n.id); } catch {}
        counts();
        if (!body.querySelector(".cbn-msg")) render([]);
      };
      m.append(meta, del); body.append(m);
    }
    body.scrollTop = body.scrollHeight;
    foot.innerHTML = `<span class="${status ? "bad" : ""}">${status || (ui.tab === "site" ? "Site-wide" : `Page: ${slug}`)}</span><span>Enter saves · Shift+Enter newline</span>`;
  };
  const counts = () => {
    const p = cache(slug).length, s = cache("site").length;
    tabPage.querySelector(".n").textContent = p ? ` ${p}` : ""; tabSite.querySelector(".n").textContent = s ? ` ${s}` : "";
    badge.hidden = !p; badge.textContent = p;
  };
  const show = async () => {
    tabPage.setAttribute("aria-selected", ui.tab !== "site"); tabSite.setAttribute("aria-selected", ui.tab === "site");
    ta.placeholder = ui.tab === "site" ? "Site-wide note…" : `Note for ${slug}…`;
    render(cache(scope())); counts();
    const list = await load(scope()).catch(() => null); if (list) { render(list); counts(); }
  };
  const setMode = (m) => {
    ui.mode = m; ls.set(UI, ui);
    panel.hidden = m === "closed"; launch.hidden = m !== "closed";
    panel.dataset.mode = m === "expanded" ? "expanded" : m === "min" ? "min" : "open";
    bExp.innerHTML = m === "expanded" ? icon.shrink : icon.expand; bExp.title = m === "expanded" ? "Shrink" : "Expand";
    if (m !== "closed" && m !== "min" && key) { show(); setTimeout(() => ta.focus(), 50); }
  };
  const add = async () => {
    const text = ta.value.trim(); if (!text) return;
    const sc = scope();
    const note = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now(), page: slug, text, scope: sc };
    setCache(sc, [...cache(sc), note]); ta.value = ""; ls.del("cbn:draft"); ta.style.height = ""; send.disabled = true; render(cache(sc)); counts();
    try { await api("POST", sc, note); }
    catch (e) { if (e.unauthorized) return lock(); ls.set(PENDING, [...ls.get(PENDING, []), note]); setCache(sc, cache(sc).map((x) => x.id === note.id ? { ...x, pending: true } : x)); status = "offline — will sync next time"; render(cache(sc)); }
  };

  function lock() {
    key = null; ls.del(KEY); cookie.del();
    body.innerHTML = ""; tabs.hidden = true; compose.hidden = true; foot.innerHTML = "";
    const box = el("div", "cbn-lock", `<div>Chase's notes journal. Enter the key once on this device and it stays unlocked.</div>`);
    const inp = el("input"); inp.type = "password"; inp.placeholder = "notes key"; inp.autocomplete = "off";
    const btn = el("button", null, "Unlock"); const msg = el("div");
    btn.onclick = async () => {
      key = inp.value.trim(); if (!key) return;
      try { await api("GET", "site"); ls.set(KEY, key); cookie.set(key); tabs.hidden = false; compose.hidden = false; box.remove(); setMode("open"); }
      catch { key = null; msg.textContent = "That key didn't work."; }
    };
    inp.onkeydown = (e) => { if (e.key === "Enter") btn.click(); };
    box.append(inp, btn, msg); body.append(box); setMode("open"); setTimeout(() => inp.focus(), 50);
  }

  // ---------- events ----------
  launch.onclick = () => setMode(ui.mode === "closed" ? "open" : "closed");
  bClose.onclick = () => setMode("closed");
  bMin.onclick = () => setMode(ui.mode === "min" ? "open" : "min");
  bExp.onclick = () => setMode(ui.mode === "expanded" ? "open" : "expanded");
  head.ondblclick = (e) => { if (e.target === head || e.target === headTitle) bMin.click(); };
  tabPage.onclick = () => { ui.tab = "page"; ls.set(UI, ui); show(); };
  tabSite.onclick = () => { ui.tab = "site"; ls.set(UI, ui); show(); };
  send.onclick = add;
  ta.oninput = () => { send.disabled = !ta.value.trim(); ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; };
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); } };
  document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === ".") { e.preventDefault(); launch.hidden ? setMode("closed") : setMode("open"); } });
  window.addEventListener("online", () => { if (ui.mode !== "closed") show(); });

  // ---------- boot ----------
  if (!key) {
    panel.hidden = true; launch.hidden = false;
    launch.onclick = () => { if (!key) { panel.hidden = false; launch.hidden = true; lock(); } else setMode(ui.mode === "closed" ? "open" : "closed"); };
    if (wantsUnlock) launch.click();
  } else { counts(); setMode(wantsUnlock && ui.mode === "closed" ? "open" : ui.mode); if (ui.mode === "closed") load(slug).then(counts).catch(() => {}); }
})();
