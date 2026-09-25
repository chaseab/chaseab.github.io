// Resume dashboard client. State comes from GET /api/resume?what=state (+ ?what=content for the
// redline) every 10 s; every request carries the shared notes key in x-notes-key.
// The redline is drawn client-side with the same modules the PDF build uses (./shared, synced from ~/career/lib).
import { draftContent, docMarks, renderDoc, esc, show } from "./shared/redline.js";
import { applyCardPlaced } from "./shared/placement.js";

const API = "/api/resume";
const DOCS = ["robotics", "mech", "scholarship", "cv"];
const DOC_NAMES = { robotics: "Robotics", mech: "Mechanical", scholarship: "Scholarship", cv: "CV" };
const OP_NAMES = { edit_bullet: "Edit bullet", add_bullet: "Add bullet", remove_bullet: "Remove bullet",
  move_bullet: "Move bullet", set_field: "Change field", add_entry: "New entry" };
const EDITABLE = ["edit_bullet", "add_bullet", "set_field"];
const $ = (id) => document.getElementById(id);

const keyStore = {
  get() { try { return localStorage.getItem("resumeKey") || ""; } catch { return ""; } },
  set(v) { try { localStorage.setItem("resumeKey", v); } catch { /* private mode: key lives in memory only */ } },
  clear() { try { localStorage.removeItem("resumeKey"); } catch { /* ignore */ } },
};
let key = keyStore.get();
let state = null;                    // {cards, status, history, commands}
let snap = null;                     // {current, live} content snapshots
let tab = "redline";
let doc = "robotics";                // PDFs tab
let rlDoc = "robotics";
let rlMode = "redline";
let editing = null;                  // Cards tab: card id whose textarea is open
let docStamp = "";
const blobUrls = {};
const pop = { id: null, pinned: false, editing: false, timer: null };

// ---------- api ----------
// Netlify has returned sporadic fast 500s; every call is safe to repeat, so 5xx/network errors retry.
async function api(method, params, body) {
  const opts = { method, headers: { "x-notes-key": key } };
  if (body !== undefined) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
  for (let attempt = 1; ; attempt++) {
    let r;
    try { r = await fetch(`${API}?${new URLSearchParams(params)}`, opts); }
    catch (e) { if (attempt < 3) { await new Promise((res) => setTimeout(res, attempt * 800)); continue; } throw e; }
    if (r.status >= 500 && attempt < 3) { await new Promise((res) => setTimeout(res, attempt * 800)); continue; }
    if (r.status === 401) { const e = new Error("unauthorized"); e.auth = true; throw e; }
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return r;
  }
}
const getJson = async (params) => (await api("GET", params)).json();
const post = async (what, body) => (await api("POST", { what }, body)).json();
async function pdfUrl(params) {
  try { return URL.createObjectURL(await (await api("GET", { what: "pdf", ...params })).blob()); } catch { return null; }
}

// ---------- helpers ----------
const ago = (ts) => {
  if (!ts) return "never";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};
const when = (ts) => (ts ? new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
const targetOf = (c) => c.target || c.entry?.id || "";
const entryOf = (c) => String(targetOf(c)).split(/[/.]/)[0] || "other";
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? u : null);
const cardById = (id) => (state?.cards || []).find((c) => c.id === id);
const showErr = (e) => {
  if (e.auth) return logout("That key didn't work.");
  $("banner").hidden = false;
  $("banner").textContent = `Request failed: ${e.message}`;
};

// ---------- top bar ----------
function renderTop() {
  const st = state.status || {};
  const scan = st.scan || {};
  const scanOld = !scan.ts || Date.now() - scan.ts > 9 * 864e5;
  $("scan-stat").className = `stat ${scanOld || scan.ok === false ? "bad" : "good"}`;
  $("scan-stat").textContent = `Last scan: ${ago(scan.ts)}${scan.ok === false ? " (failed)" : ""}`;

  const w = st.worker || {};
  const workerBad = !w.ts || Date.now() - w.ts > 10 * 6e4;
  $("worker-stat").className = `stat ${workerBad ? "bad" : "good"}`;
  $("worker-stat").textContent = `Worker: ${ago(w.ts)}${w.msg && w.msg !== "ok" ? ` (${w.msg})` : ""}`;

  const draft = st.draft || {};
  const waiting = (state.cards || []).filter((c) => c.status === "approved").length;
  const n = (draft.changes || 0) + waiting;
  $("draft-stat").className = "stat";
  $("draft-stat").textContent = n ? `${n} approved change${n === 1 ? "" : "s"} not yet published` : "Draft matches live";

  const docErrors = (draft.docs || []).filter((d) => d.error);
  $("btn-publish").disabled = docErrors.length > 0;
  $("btn-publish").title = docErrors.length ? `Fix first: ${docErrors.map((d) => `${d.doc}: ${d.error}`).join("; ")}` : "";

  const problems = [];
  if (workerBad) problems.push("The desktop worker has been silent for over 10 minutes. Approvals and publishes wait until it's back.");
  if (scanOld) problems.push(scan.ts ? "No scan in over 9 days." : "No scan has run yet.");
  if (scan.ok === false) problems.push(`Last scan failed: ${scan.summary || "see scan log on the desktop"}`);
  if (draft.publishError) problems.push(`Publish blocked: ${draft.publishError}`);
  $("banner").hidden = !problems.length;
  $("banner").innerHTML = problems.map(esc).join("<br>");

  $("scan-summary-wrap").hidden = !scan.summary || scan.ok === false;
  $("scan-summary").textContent = scan.summary || "";

  const q = (state.commands || []).sort((a, b) => a.ts - b.ts);
  $("queued").textContent = q.length ? `Queued for the worker: ${q.map((c) => c.type + (c.arg ? ` ${c.arg}` : "")).join(", ")}` : "";
}

// ---------- redline ----------
function renderRedline() {
  if (pop.editing) return;           // never redraw under an open edit
  const page = $("rl-page");
  const cards = state?.cards || [];
  const pending = cards.filter((c) => c.status === "pending");
  $("pending-count").textContent = pending.length || "";
  if (!snap?.current) {
    page.innerHTML = `<p class="empty">Waiting for the desktop worker to upload the first content snapshot. It does this when it starts and after every rebuild.</p>`;
    $("rl-docs").innerHTML = "";
    return;
  }
  const { content: draft, failed } = draftContent(snap.current, cards);
  const docsById = new Map(draft.docs.map((d) => [d.id, d]));
  const order = [...DOCS.filter((d) => docsById.has(d)), ...draft.docs.map((d) => d.id).filter((d) => !DOCS.includes(d))];
  const marksFor = Object.fromEntries(order.map((id) => [id, docMarks(draft, docsById.get(id), cards)]));
  $("rl-docs").innerHTML = order.map((id) => {
    const n = marksFor[id].cards.size;
    return `<button data-rldoc="${esc(id)}" aria-pressed="${id === rlDoc}">${esc(DOC_NAMES[id] || id)}${n ? ` <span class="count">${n}</span>` : ""}</button>`;
  }).join("");
  document.querySelectorAll("#rl-modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === rlMode)));
  $("rl-legend").hidden = rlMode === "live";

  // Redline mode gets a clean "after" page beside it: the draft with every pending card applied.
  const pair = rlMode === "redline";
  $("rl-desk").classList.toggle("rl-pair", pair);
  $("rl-after-pane").hidden = !pair;
  $("tab-redline").closest("main").classList.toggle("wide", pair);
  $("rl-cap-l").textContent = pair ? "Redline: click a mark to approve, reject, or edit" : "";
  $("rl-cap-l").hidden = !pair;

  let r;
  if (rlMode === "live") {
    const liveDoc = snap.live?.docs.find((d) => d.id === rlDoc);
    r = liveDoc ? renderDoc({ content: snap.live, doc: liveDoc }) : { html: `<p class="empty">Nothing published yet.</p>`, other: "" };
  } else {
    const d = docsById.get(rlDoc) || docsById.get(order[0]);
    r = renderDoc({ content: draft, doc: d, marks: rlMode === "redline" ? marksFor[d.id] : null, live: snap.live });
  }
  page.innerHTML = r.html;
  if (pair) {
    const d = docsById.get(rlDoc) || docsById.get(order[0]);
    const after = afterContent(draft, cards);
    const ad = after.docs.find((x) => x.id === d.id) || d;
    const n = marksFor[d.id].cards.size;
    $("rl-after").innerHTML = renderDoc({ content: after, doc: ad }).html;
    $("rl-cap-r").textContent = n ? `After: all ${n} pending change${n > 1 ? "s" : ""} applied` : "After: no pending changes for this doc";
  } else $("rl-after").innerHTML = "";
  fitPapers();
  $("rl-other").innerHTML = r.other;
  $("rl-other-wrap").hidden = !r.other;
  $("rl-failed").hidden = !failed.length;
  $("rl-failed").innerHTML = failed.length
    ? `Approved but won't apply (the worker will mark ${failed.length === 1 ? "it" : "them"} stale): ${failed.map((f) => `<code>${esc(targetOf(f.card))}</code> ${esc(f.reason)}`).join("; ")}` : "";
  if (pop.id) {
    const c = cardById(pop.id);
    if (!c || c.status !== "pending" || rlMode !== "redline") closePop(true);
    else document.querySelectorAll(`[data-card="${CSS.escape(pop.id)}"]`).forEach((n) => n.classList.add("rl-active"));
  }
}

// The draft as if every pending card were approved too, applied oldest first like the worker does.
// Cards that can't apply are skipped; the redline already lists them under "Changes not drawn".
function afterContent(draft, cards) {
  let content = JSON.parse(JSON.stringify(draft));
  const pending = cards.filter((c) => c.status === "pending")
    .sort((a, b) => (a.updated || a.created || 0) - (b.updated || b.created || 0));
  for (const card of pending) {
    const trial = JSON.parse(JSON.stringify(content));
    try { applyCardPlaced(trial, card); content = trial; } catch { /* stale card */ }
  }
  return content;
}

// Side by side, each letter page is zoomed down to fit its column (never up).
function fitPapers() {
  document.querySelectorAll("#rl-desk .rl-paper").forEach((el) => { el.style.zoom = ""; });
  if (!$("rl-desk").classList.contains("rl-pair")) return;
  document.querySelectorAll("#rl-desk .rl-pane").forEach((pane) => {
    const el = pane.querySelector(".rl-paper");
    if (el) el.style.zoom = String(Math.min(1, pane.clientWidth / el.offsetWidth));
  });
}

// Popover on a redline mark: why, proof, Approve / Reject / Edit.
function popHtml(c) {
  const proof = safeUrl(c.proof);
  const docs = (c.docs || []).map((d) => (typeof d === "string" ? d : d.doc));
  const editable = EDITABLE.includes(c.op) && (typeof c.after === "string" || c.after == null);
  return `<div class="pop-head"><span class="op">${esc(OP_NAMES[c.op] || c.op)}</span> <code>${esc(targetOf(c))}</code></div>
    ${c.why ? `<p class="pop-why">${esc(c.why)}</p>` : ""}
    <p class="pop-meta">${proof ? `<a href="${esc(proof)}" target="_blank" rel="noopener">Proof ↗</a> · ` : ""}${docs.length ? `affects ${esc(docs.join(", "))}` : ""}${c.source ? ` · ${esc(c.source)}` : ""}</p>
    ${pop.editing
      ? `<textarea id="pop-text" rows="5">${esc(show(c.after))}</textarea>
         <div class="pop-actions"><button class="primary" data-pop="save">Save and approve</button><button data-pop="cancel">Cancel</button></div>`
      : `<div class="pop-actions"><button class="primary" data-pop="approve">Approve</button><button data-pop="reject">Reject</button>${editable ? `<button data-pop="edit">Edit</button>` : ""}</div>`}`;
}
function placePop(el) {
  const p = $("rl-pop");
  const r = el.getBoundingClientRect();
  const w = Math.min(420, window.innerWidth - 24);
  p.style.width = `${w}px`;
  p.style.left = `${Math.max(12, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 12))}px`;
  p.style.top = `${r.bottom + window.scrollY + 6}px`;
}
function openPop(el, id, pinned) {
  const c = cardById(id);
  if (!c || c.status !== "pending") return;
  clearTimeout(pop.timer);
  if (pop.id !== id) pop.editing = false;
  document.querySelectorAll(".rl-active").forEach((n) => n.classList.remove("rl-active"));
  pop.id = id; pop.pinned = pop.pinned && pop.id === id ? true : pinned;
  $("rl-pop").innerHTML = popHtml(c);
  $("rl-pop").hidden = false;
  placePop(el);
  document.querySelectorAll(`[data-card="${CSS.escape(id)}"]`).forEach((n) => n.classList.add("rl-active"));
  if (pop.editing) $("pop-text")?.focus();
}
function closePop(force = false) {
  if (!force && (pop.pinned || pop.editing)) return;
  clearTimeout(pop.timer);
  pop.id = null; pop.pinned = false; pop.editing = false;
  $("rl-pop").hidden = true;
  document.querySelectorAll(".rl-active").forEach((n) => n.classList.remove("rl-active"));
}

// Optimistic: the page updates at once (approved -> accepted, rejected -> original), then the API call.
async function decide(id, body) {
  const c = cardById(id);
  if (c) Object.assign(c, body, { updated: Date.now() });
  pop.editing = false; editing = null;
  closePop(true);
  render();
  try { await post("card", { id, ...body }); } catch (e) { showErr(e); }
  await refresh();
}

// ---------- cards tab ----------
function cardHtml(c, recent) {
  const docs = (c.docs || []).map((d) => `<span class="chip">${esc(typeof d === "string" ? d : d.doc)}</span>`).join("");
  const proof = safeUrl(c.proof);
  let body;
  if (c.op === "add_entry") {
    const e = c.entry || {};
    body = `<div class="after"><strong>${esc(e.title)}</strong>${e.org ? ` · ${esc(e.org)}` : ""}${e.dates ? ` · ${esc(e.dates)}` : ""}${(e.bullets || []).map((b) => `\n• ${esc(b.text)}`).join("")}</div>`;
  } else {
    const before = c.base != null && c.base !== "" ? `<div class="before">${esc(show(c.base))}</div>` : "";
    const after = c.op === "remove_bullet" ? "" : c.op === "move_bullet"
      ? `<div class="after">Move to position ${esc(c.position)}</div>` : `<div class="after">${esc(show(c.after))}</div>`;
    body = before + after;
  }
  const actions = recent
    ? `<div class="why"><span class="status ${esc(c.status)}">${esc(c.status)}</span>${c.reason ? ` · ${esc(c.reason)}` : ""}${c.commit ? ` · ${esc(String(c.commit).slice(0, 8))}` : ""}
       <button class="link del-link" data-delcard="${esc(c.id)}">Delete</button></div>`
    : editing === c.id
      ? `<textarea id="edit-${esc(c.id)}">${esc(show(c.after))}</textarea>
         <div class="card-actions"><button class="primary" data-act="save" data-id="${esc(c.id)}">Save and approve</button>
         <button data-act="cancel" data-id="${esc(c.id)}">Cancel</button></div>`
      : `<div class="card-actions"><button class="primary" data-act="approve" data-id="${esc(c.id)}">Approve</button>
         <button data-act="reject" data-id="${esc(c.id)}">Reject</button>
         ${EDITABLE.includes(c.op) ? `<button data-act="edit" data-id="${esc(c.id)}">Edit</button>` : ""}</div>`;
  return `<article class="card">
    <div class="card-head"><span class="op">${esc(OP_NAMES[c.op] || c.op)}</span>
      <span class="target">${esc(targetOf(c))}</span><span class="chips">${docs}</span></div>
    ${body}
    ${c.why || proof ? `<p class="why">${esc(c.why)}${proof ? ` · <a href="${esc(proof)}" target="_blank" rel="noopener">proof</a>` : ""}</p>` : ""}
    ${actions}</article>`;
}

function renderCards(force = false) {
  const cards = state.cards || [];
  const pending = cards.filter((c) => c.status === "pending");
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
  const recent = cards.filter((c) => ["applied", "rejected", "stale", "approved"].includes(c.status))
    .sort((a, b) => (b.updated || b.created) - (a.updated || a.created)).slice(0, 60);
  $("recent-list").innerHTML = recent.length ? recent.map((c) => cardHtml(c, true)).join("") : `<p class="empty">Nothing yet.</p>`;
}

// ---------- PDFs tab ----------
async function renderDocs() {
  $("doc-tabs").innerHTML = DOCS.map((d) => `<button data-doc="${d}" aria-pressed="${d === doc}">${DOC_NAMES[d]}</button>`).join("");
  const draft = (state.status || {}).draft || {};
  const info = (draft.docs || []).find((d) => d.doc === doc);
  $("doc-meta").innerHTML = info
    ? `${info.pages ?? "?"} page${info.pages === 1 ? "" : "s"}${info.error ? ` · <span class="err">${esc(info.error)}</span>` : ""}
       ${(info.warnings || []).length ? `<ul>${info.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}`
    : `<span class="muted">No build reported yet.</span>`;
  const stamp = `${doc}|${draft.ts || ""}|${(state.history || [])[0]?.tag || ""}`;
  if (stamp === docStamp) return;
  docStamp = stamp;
  for (const stage of ["preview", "live"]) {
    const url = await pdfUrl({ doc, stage });
    if (blobUrls[stage]) URL.revokeObjectURL(blobUrls[stage]);
    blobUrls[stage] = url;
    const frame = $(`pdf-${stage}`);
    if (url) { frame.removeAttribute("srcdoc"); frame.src = url; }
    else frame.srcdoc = `<p style="font:14px sans-serif;color:#6c757d;padding:16px">No ${stage} PDF yet.</p>`;
  }
}

// ---------- history tab ----------
function renderHistory() {
  const h = state.history || [];
  $("history-empty").hidden = h.length > 0;
  $("history-rows").innerHTML = h.map((row, i) => `<tr>
    <td><strong>${esc(row.tag)}</strong>${i === 0 ? ` <span class="chip">live</span>` : ""}${row.restoredFrom ? `<br><span class="muted">restored from ${esc(row.restoredFrom)}</span>` : ""}</td>
    <td>${esc(when(row.ts))}</td>
    <td>${(row.changes || []).length}</td>
    <td class="pdf-links">${DOCS.map((d) => `<button data-archive="${esc(row.tag)}" data-doc="${d}">${DOC_NAMES[d]}</button>`).join("")}</td>
    <td class="row-actions"><button data-restore="${esc(row.tag)}">Restore</button> <button class="link del-link" data-delhist="${esc(row.tag)}">Delete</button></td></tr>`).join("");
}

function render() {
  if (!state) return;
  renderTop();
  renderRedline();
  renderCards();
  renderHistory();
  if (tab === "documents") renderDocs();
}

// ---------- data ----------
let failures = 0;
async function refresh() {
  try {
    const [st, content] = await Promise.all([getJson({ what: "state" }), getJson({ what: "content" })]);
    state = st; snap = content; failures = 0;
    render();
  } catch (e) {
    if (e.auth) return logout("That key didn't work.");
    if (++failures < 3) return;      // one bad poll isn't worth a banner; the next one retries
    $("banner").hidden = false;
    $("banner").textContent = `Can't reach the API: ${e.message}`;
  }
}
async function command(type, arg) {
  await post("command", { type, arg });
  await refresh();
}

// ---------- events ----------
const page = () => $("rl-page");
document.addEventListener("mouseover", (ev) => {
  const m = ev.target.closest?.("#rl-page [data-card], #rl-other [data-card]");
  if (ev.target.closest?.("#rl-pop")) {
    clearTimeout(pop.timer);         // moving from a mark into its popover keeps it open
  } else if (m && !pop.pinned && !pop.editing) {
    clearTimeout(pop.timer);
    pop.timer = setTimeout(() => openPop(m, m.dataset.card, false), 200);
  } else if (!m && !pop.pinned) {
    clearTimeout(pop.timer);
    pop.timer = setTimeout(() => closePop(), 350);
  }
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closePop(true); });

document.addEventListener("click", async (ev) => {
  const mark = ev.target.closest("#rl-page [data-card], #rl-other [data-card]");
  if (mark && !ev.target.closest("a")) { pop.pinned = false; openPop(mark, mark.dataset.card, true); return; }
  const b = ev.target.closest("button");
  if (!b) { if (!ev.target.closest("#rl-pop")) closePop(true); return; }
  try {
    if (b.dataset.pop) {
      const id = pop.id;
      if (b.dataset.pop === "approve") await decide(id, { status: "approved" });
      else if (b.dataset.pop === "reject") await decide(id, { status: "rejected" });
      else if (b.dataset.pop === "edit") { pop.editing = true; pop.pinned = true; openPop(document.querySelector(`[data-card="${CSS.escape(id)}"]`) || page(), id, true); }
      else if (b.dataset.pop === "cancel") { pop.editing = false; openPop(document.querySelector(`[data-card="${CSS.escape(id)}"]`) || page(), id, true); }
      else if (b.dataset.pop === "save") await decide(id, { after: $("pop-text").value, edited: true, status: "approved" });
    } else if (b.dataset.tab) {
      tab = b.dataset.tab;
      closePop(true);
      document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      for (const t of ["redline", "suggestions", "documents", "history"]) $(`tab-${t}`).hidden = t !== tab;
      if (tab === "documents") renderDocs();
    } else if (b.dataset.rldoc) {
      rlDoc = b.dataset.rldoc; closePop(true); renderRedline();
    } else if (b.dataset.mode) {
      rlMode = b.dataset.mode; closePop(true); renderRedline();
    } else if (b.dataset.act) {
      const id = b.dataset.id;
      if (b.dataset.act === "approve") await decide(id, { status: "approved" });
      else if (b.dataset.act === "reject") await decide(id, { status: "rejected" });
      else if (b.dataset.act === "edit") { editing = id; renderCards(true); $(`edit-${id}`)?.focus(); }
      else if (b.dataset.act === "cancel") { editing = null; renderCards(true); }
      else if (b.dataset.act === "save") {
        const card = cardById(id);
        let after = $(`edit-${id}`).value;
        if (card && card.after != null && typeof card.after !== "string") { try { after = JSON.parse(after); } catch { /* keep as text */ } }
        await decide(id, { after, edited: true, status: "approved" });
      }
    } else if (b.dataset.delcard) {
      if (confirm(`Delete card ${b.dataset.delcard}? This only removes it from the dashboard; content already applied stays.`)) {
        await api("DELETE", { what: "card", id: b.dataset.delcard }); await refresh();
      }
    } else if (b.dataset.delhist) {
      if (confirm(`Delete history row ${b.dataset.delhist} and its archived PDFs? The live PDFs don't change.`)) {
        await api("DELETE", { what: "history", tag: b.dataset.delhist }); await refresh();
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
  } catch (e) { showErr(e); }
});
window.addEventListener("resize", () => { fitPapers(); const m = pop.id && document.querySelector(`[data-card="${CSS.escape(pop.id)}"]`); if (m) placePop(m); });

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
  key = ""; keyStore.clear();
  $("app").hidden = true; $("login").hidden = false;
  $("login-error").hidden = !msg; $("login-error").textContent = msg || "";
}
$("login-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  key = $("key").value.trim();
  keyStore.set(key);
  start();
});

if (key) start(); else logout();
