// Resume dashboard client. State comes from GET /api/resume?what=state every 10 s;
// every request carries the shared notes key in x-notes-key.
(() => {
  "use strict";
  const API = "/api/resume";
  const DOCS = ["robotics", "mech", "scholarship", "cv"];
  const DOC_NAMES = { robotics: "Robotics", mech: "Mechanical", scholarship: "Scholarship", cv: "CV" };
  const $ = (id) => document.getElementById(id);

  const store = {
    get() { try { return localStorage.getItem("resumeKey") || ""; } catch { return ""; } },
    set(v) { try { localStorage.setItem("resumeKey", v); } catch { /* private mode: key lives in memory only */ } },
    clear() { try { localStorage.removeItem("resumeKey"); } catch { /* ignore */ } },
  };
  let key = store.get();
  let state = null;
  let tab = "suggestions";
  let doc = "robotics";
  let editing = null;                 // card id whose textarea is open; suggestions don't re-render under it
  let docStamp = "";                  // what the loaded iframes reflect, to avoid refetching PDFs every poll
  const blobUrls = {};

  // ---------- api ----------
  async function api(method, params, body) {
    const opts = { method, headers: { "x-notes-key": key } };
    if (body !== undefined) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
    const r = await fetch(`${API}?${new URLSearchParams(params)}`, opts);
    if (r.status === 401) { const e = new Error("unauthorized"); e.auth = true; throw e; }
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r;
  }
  const getJson = async (params) => (await api("GET", params)).json();
  const post = async (what, body) => (await api("POST", { what }, body)).json();
  async function pdfUrl(params) {
    try {
      const r = await api("GET", { what: "pdf", ...params });
      return URL.createObjectURL(await r.blob());
    } catch { return null; }
  }

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const show = (v) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v, null, 1));
  const ago = (ts) => {
    if (!ts) return "never";
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} h ago`;
    return `${Math.round(h / 24)} days ago`;
  };
  const when = (ts) => (ts ? new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
  const entryOf = (c) => c.entry?.id || String(c.target || "").split(/[/.]/)[0] || "other";
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? u : null);

  // ---------- rendering ----------
  function renderTop() {
    const st = state.status || {};
    const scan = st.scan || {};
    const scanOld = !scan.ts || Date.now() - scan.ts > 9 * 864e5;
    const scanBad = scanOld || scan.ok === false;
    $("scan-stat").className = `stat ${scanBad ? "bad" : "good"}`;
    $("scan-stat").textContent = `Last scan: ${ago(scan.ts)}${scan.ok === false ? " (failed)" : ""}`;

    const w = st.worker || {};
    const workerBad = !w.ts || Date.now() - w.ts > 10 * 6e4;
    $("worker-stat").className = `stat ${workerBad ? "bad" : "good"}`;
    $("worker-stat").textContent = `Worker: ${ago(w.ts)}${w.msg && w.msg !== "ok" ? ` (${w.msg})` : ""}`;

    const draft = st.draft || {};
    const n = draft.changes || 0;
    $("draft-stat").className = "stat";
    $("draft-stat").textContent = n ? `${n} approved change${n === 1 ? "" : "s"} not yet published` : "Draft matches live";

    const docErrors = (draft.docs || []).filter((d) => d.error);
    $("btn-publish").disabled = docErrors.length > 0;
    $("btn-publish").title = docErrors.length ? `Fix first: ${docErrors.map((d) => `${d.doc}: ${d.error}`).join("; ")}` : "";

    const problems = [];
    if (workerBad) problems.push("The desktop worker has been silent for over 10 minutes. Approvals and publishes wait until it's back.");
    if (scanOld) problems.push("No scan in over 9 days.");
    if (scan.ok === false) problems.push(`Last scan failed: ${scan.summary || "see scan log on the desktop"}`);
    if (draft.publishError) problems.push(`Publish blocked: ${draft.publishError}`);
    $("banner").hidden = !problems.length;
    $("banner").innerHTML = problems.map(esc).join("<br>");

    $("scan-summary").hidden = !scan.summary || scan.ok === false;
    $("scan-summary").textContent = scan.summary || "";

    const q = (state.commands || []).sort((a, b) => a.ts - b.ts);
    $("queued").textContent = q.length ? `Queued for the worker: ${q.map((c) => c.type + (c.arg ? ` ${c.arg}` : "")).join(", ")}` : "";
  }

  function cardHtml(c, recent) {
    const docs = (c.docs || []).map((d) => `<span class="chip">${esc(typeof d === "string" ? d : d.doc)}</span>`).join("");
    const proof = safeUrl(c.proof);
    let body;
    if (c.op === "add_entry") {
      const e = c.entry || {};
      body = `<div class="after"><strong>${esc(e.title)}</strong>${e.org ? ` · ${esc(e.org)}` : ""}${e.dates ? ` · ${esc(e.dates)}` : ""}
        ${(e.bullets || []).map((b) => `\n• ${esc(b.text)}`).join("")}</div>`;
    } else {
      const before = c.base != null && c.base !== "" ? `<div class="before">${esc(show(c.base))}</div>` : "";
      const after = c.op === "remove_bullet" ? "" : c.op === "move_bullet"
        ? `<div class="after">Move to position ${esc(c.position)}</div>`
        : `<div class="after">${esc(show(c.after))}</div>`;
      body = before + after;
    }
    const actions = recent ? `<div class="why"><span class="status ${esc(c.status)}">${esc(c.status)}</span>${c.reason ? ` · ${esc(c.reason)}` : ""}${c.commit ? ` · ${esc(String(c.commit).slice(0, 8))}` : ""}</div>`
      : editing === c.id
        ? `<textarea id="edit-${esc(c.id)}">${esc(show(c.after))}</textarea>
           <div class="card-actions"><button class="primary" data-act="save" data-id="${esc(c.id)}">Save and approve</button>
           <button data-act="cancel" data-id="${esc(c.id)}">Cancel</button></div>`
        : `<div class="card-actions"><button class="primary" data-act="approve" data-id="${esc(c.id)}">Approve</button>
           <button data-act="reject" data-id="${esc(c.id)}">Reject</button>
           ${["edit_bullet", "add_bullet", "set_field"].includes(c.op) ? `<button data-act="edit" data-id="${esc(c.id)}">Edit</button>` : ""}</div>`;
    return `<article class="card">
      <div class="card-head"><span class="op">${esc(String(c.op || "").replace("_", " "))}</span>
        <span class="target">${esc(c.target || c.entry?.id || "")}</span><span class="chips">${docs}</span></div>
      ${body}
      ${c.why || proof ? `<p class="why">${esc(c.why)}${proof ? ` · <a href="${esc(proof)}" target="_blank" rel="noopener">proof</a>` : ""}</p>` : ""}
      ${actions}</article>`;
  }

  function renderCards(force = false) {
    const cards = state.cards || [];
    const pending = cards.filter((c) => c.status === "pending");
    $("pending-count").textContent = pending.length || "";
    if (!force && editing && document.getElementById(`edit-${editing}`)) return; // polling must not wipe an open edit
    const groups = new Map();
    for (const c of pending.slice().sort((a, b) => a.created - b.created)) {
      const g = entryOf(c);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(c);
    }
    $("cards").innerHTML = pending.length
      ? [...groups].map(([g, list]) => `<div class="group"><h2>${esc(g)}</h2>${list.map((c) => cardHtml(c, false)).join("")}</div>`).join("")
      : `<p class="empty">No pending suggestions. The next scan runs Friday at 18:00, or use Scan now.</p>`;
    const recent = cards.filter((c) => ["applied", "rejected", "stale"].includes(c.status))
      .sort((a, b) => (b.updated || b.created) - (a.updated || a.created)).slice(0, 40);
    $("recent-list").innerHTML = recent.length ? recent.map((c) => cardHtml(c, true)).join("") : `<p class="empty">Nothing yet.</p>`;
  }

  async function renderDocs() {
    $("doc-tabs").innerHTML = DOCS.map((d) => `<button data-doc="${d}" aria-pressed="${d === doc}">${DOC_NAMES[d]}</button>`).join("");
    const draft = (state.status || {}).draft || {};
    const info = (draft.docs || []).find((d) => d.doc === doc);
    $("doc-meta").innerHTML = info
      ? `${info.pages ?? "?"} page${info.pages === 1 ? "" : "s"}${info.error ? ` · <span class="err">${esc(info.error)}</span>` : ""}
         ${(info.warnings || []).length ? `<ul>${info.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}`
      : `<span class="muted">No build reported yet.</span>`;
    const lastPub = (state.history || [])[0]?.tag || "";
    const stamp = `${doc}|${draft.ts || ""}|${lastPub}`;
    if (stamp === docStamp) return;
    docStamp = stamp;
    for (const stage of ["preview", "live"]) {
      const url = await pdfUrl({ doc, stage });
      if (blobUrls[stage]) URL.revokeObjectURL(blobUrls[stage]);
      blobUrls[stage] = url;
      $(`pdf-${stage}`).src = url || "about:blank";
      if (!url) $(`pdf-${stage}`).srcdoc = `<p style="font:14px sans-serif;color:#6c757d;padding:16px">No ${stage} PDF yet.</p>`;
      else $(`pdf-${stage}`).removeAttribute("srcdoc");
    }
  }

  function renderHistory() {
    const h = state.history || [];
    $("history-empty").hidden = h.length > 0;
    $("history-rows").innerHTML = h.map((row) => `<tr>
      <td><strong>${esc(row.tag)}</strong>${row.restoredFrom ? `<br><span class="muted">restored from ${esc(row.restoredFrom)}</span>` : ""}</td>
      <td>${esc(when(row.ts))}</td>
      <td>${(row.changes || []).length}</td>
      <td class="pdf-links">${DOCS.map((d) => `<button data-archive="${esc(row.tag)}" data-doc="${d}">${DOC_NAMES[d]}</button>`).join("")}</td>
      <td><button data-restore="${esc(row.tag)}">Restore</button></td></tr>`).join("");
  }

  function render() {
    if (!state) return;
    renderTop();
    renderCards();
    renderHistory();
    if (tab === "documents") renderDocs();
  }

  // ---------- data ----------
  async function refresh() {
    try {
      state = await getJson({ what: "state" });
      render();
    } catch (e) {
      if (e.auth) return logout("That key didn't work.");
      $("banner").hidden = false;
      $("banner").textContent = `Can't reach the API: ${e.message}`;
    }
  }
  async function decide(id, body) {
    await post("card", { id, ...body });
    editing = null;
    await refresh();
  }
  async function command(type, arg) {
    await post("command", { type, arg });
    await refresh();
  }

  // ---------- events ----------
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    try {
      if (b.dataset.tab) {
        tab = b.dataset.tab;
        document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
        for (const t of ["suggestions", "documents", "history"]) $(`tab-${t}`).hidden = t !== tab;
        if (tab === "documents") renderDocs();
      } else if (b.dataset.act) {
        const id = b.dataset.id;
        if (b.dataset.act === "approve") await decide(id, { status: "approved" });
        else if (b.dataset.act === "reject") await decide(id, { status: "rejected" });
        else if (b.dataset.act === "edit") { editing = id; renderCardsForce(); }
        else if (b.dataset.act === "cancel") { editing = null; renderCardsForce(); }
        else if (b.dataset.act === "save") {
          const card = state.cards.find((c) => c.id === id);
          let after = $(`edit-${id}`).value;
          if (card && typeof card.after !== "string") { try { after = JSON.parse(after); } catch { /* keep as text */ } }
          await decide(id, { after, edited: true, status: "approved" });
        }
      } else if (b.dataset.doc && !b.dataset.archive) {
        doc = b.dataset.doc; renderDocs();
      } else if (b.dataset.archive) {
        const url = await pdfUrl({ doc: b.dataset.doc, stage: "archive", tag: b.dataset.archive });
        if (url) window.open(url, "_blank", "noopener"); else b.disabled = true;
      } else if (b.dataset.restore) {
        if (confirm(`Restore ${b.dataset.restore}? Content resets to that tag and it is republished live.`)) await command("restore", b.dataset.restore);
      } else if (b.id === "btn-publish") {
        await command("publish");
      } else if (b.id === "btn-discard") {
        if (confirm("Discard every approved change since the last publish?")) await command("discard");
      } else if (b.id === "btn-scan") {
        await command("scan");
      } else if (b.id === "btn-rebuild") {
        await command("rebuild");
      } else if (b.id === "btn-forget") {
        logout();
      }
    } catch (e) {
      if (e.auth) return logout("That key didn't work.");
      $("banner").hidden = false;
      $("banner").textContent = `Request failed: ${e.message}`;
    }
  });
  function renderCardsForce() {
    renderCards(true);
    if (editing) $(`edit-${editing}`)?.focus();
  }

  // ---------- login ----------
  let timer = null;
  function start() {
    $("login").hidden = true; $("app").hidden = false;
    refresh();
    clearInterval(timer);
    timer = setInterval(refresh, 10000);
  }
  function logout(msg) {
    clearInterval(timer);
    key = ""; store.clear();
    $("app").hidden = true; $("login").hidden = false;
    $("login-error").hidden = !msg; $("login-error").textContent = msg || "";
  }
  $("login-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    key = $("key").value.trim();
    store.set(key);
    start();
  });

  if (key) start(); else logout();
})();
