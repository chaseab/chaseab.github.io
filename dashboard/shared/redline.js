// Redline: the resume drawn as HTML with pending suggestion cards marked in place, like tracked
// changes. Pure and dependency-free; shared verbatim with the dashboard (dashboard/shared/redline.js)
// and unit-tested here, so the page follows exactly the rules the TeX build uses.
import { selectBullets, bulletText } from "./select.js";
import { applyCard } from "./cards.js";
import { placementsFor, applyCardPlaced } from "./placement.js";
import { inlineTokens } from "./inline.js";

const clone = (x) => JSON.parse(JSON.stringify(x));
const byTime = (a, b) => (a.updated || a.created || 0) - (b.updated || b.created || 0);
const getPath = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const richHtml = (s) => inlineTokens(s).map((k) =>
  k.t === "link" ? `<a href="${esc(k.href)}" target="_blank" rel="noopener">${esc(k.s)}</a>`
    : k.t === "italic" ? `<i>${esc(k.s)}</i>` : esc(k.s)).join("");
const listItem = (a) => (a && typeof a === "object" ? [a.title, a.dates].filter(Boolean).join(" — ") : String(a ?? ""));
export const show = (v) => (Array.isArray(v) ? v.map(listItem).join(", ") : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

// Current content plus approved-but-not-yet-applied cards: what the draft will be.
export function draftContent(current, cards) {
  let content = clone(current);
  const failed = [];
  for (const card of cards.filter((c) => c.status === "approved").sort(byTime)) {
    const trial = clone(content);
    try { applyCardPlaced(trial, card); content = trial; } catch (e) { failed.push({ card, reason: e.message }); }
  }
  return { content, failed };
}

const entryIdsIn = (doc) => new Set(doc.sections.flatMap((s) => s.entries ?? []));

// Is a profile path drawn in this doc? The header and education are always drawn; skills need a
// skills section; any other profile list (coursework, presentations, ...) needs a list section for it.
const HEADER_KEYS = ["name", "phone", "email", "site", "linkedin", "education"];
function profilePathInDoc(path, doc) {
  const key = path.split(".")[1];
  if (key === "skills") return doc.sections.some((s) => s.kind === "skills");
  if (HEADER_KEYS.includes(key)) return true;
  return doc.sections.some((s) => s.kind === "list" && s.from === key);
}

function slotFor(m, eid) {
  if (!m.bullets.has(eid)) m.bullets.set(eid, { del: new Map(), edit: new Map(), ins: [], notes: [] });
  return m.bullets.get(eid);
}
const push = (map, k, v) => (map.has(k) ? map.get(k).push(v) : map.set(k, [v]));

// Marks for one doc from the pending cards, computed against `content` (the draft).
// Each card is diffed alone: select the doc's bullets before and after applying just that card.
export function docMarks(content, doc, cards) {
  const m = { bullets: new Map(), fields: new Map(), entries: [], other: [], cards: new Set() };
  const inDoc = entryIdsIn(doc);
  const cap = doc.max_bullets;
  for (const card of cards.filter((c) => c.status === "pending").sort(byTime)) {
    if (card.op === "add_entry") {
      const e = card.entry ?? {};
      if (content.entries.some((x) => x.id === e.id)) { m.other.push({ card, text: `Can't apply: entry "${e.id}" already exists` }); m.cards.add(card.id); continue; }
      for (const p of placementsFor(card, content.docs).filter((p) => p.doc === doc.id)) {
        const sel = selectBullets(doc, e);
        m.entries.push({ card, entry: e, section: p.section, guessed: p.guessed, kept: sel.kept, cut: sel.cut });
        m.cards.add(card.id);
      }
      continue;
    }
    if (card.op === "set_field") {
      const t = String(card.target ?? "");
      const isProfile = t.startsWith("profile.");
      if (isProfile ? !profilePathInDoc(t, doc) : !inDoc.has(t.split(".")[0])) continue;
      try { applyCard(clone(content), card); } catch (e) { m.other.push({ card, text: `Can't apply: ${e.message}` }); m.cards.add(card.id); continue; }
      const old = isProfile ? getPath(content.profile, t.slice(8)) : getPath(content.entries.find((x) => x.id === t.split(".")[0]), t.split(".").slice(1).join("."));
      push(m.fields, t, { card, old, new: card.after });
      m.cards.add(card.id);
      continue;
    }
    // bullet ops: edit_bullet, add_bullet, remove_bullet, move_bullet
    const [eid, target] = String(card.target ?? "").split("/");
    if (!inDoc.has(eid)) continue;
    const trial = clone(content);
    try { applyCard(trial, card); } catch (e) { m.other.push({ card, text: `Can't apply: ${e.message}` }); m.cards.add(card.id); continue; }
    const eB = content.entries.find((x) => x.id === eid), eA = trial.entries.find((x) => x.id === eid);
    const B = selectBullets(doc, eB), A = selectBullets(doc, eA);
    const Bk = B.kept.map((b) => b.id), Ak = A.kept.map((b) => b.id);
    const txtB = new Map(B.kept.map((b) => [b.id, bulletText(b, doc)])), txtA = new Map(A.kept.map((b) => [b.id, bulletText(b, doc)]));
    const newIds = (eA.bullets ?? []).filter((b) => !(eB.bullets ?? []).some((x) => x.id === b.id)).map((b) => b.id);
    const slot = slotFor(m, eid);
    let touched = false;
    const anchorOf = (id) => { const i = Ak.indexOf(id); for (let j = i - 1; j >= 0; j--) if (Bk.includes(Ak[j]) && Ak[j] !== id) return Ak[j]; return null; };

    for (const id of Bk) if (!Ak.includes(id)) {
      push(slot.del, id, { card, label: id === target ? "" : `pushed out: ${cap}-bullet limit` }); touched = true;
    }
    for (const id of Ak) if (!Bk.includes(id)) {
      slot.ins.push({ card, anchor: anchorOf(id), text: txtA.get(id), label: newIds.includes(id) ? "" : "moves into this doc" }); touched = true;
    }
    for (const id of Ak) if (Bk.includes(id) && txtA.get(id) !== txtB.get(id)) { push(slot.edit, id, { card, text: txtA.get(id) }); touched = true; }
    if (card.op === "move_bullet" && Bk.includes(target) && Ak.includes(target)) {
      const before = Bk.filter((x) => Ak.includes(x)), after = Ak.filter((x) => Bk.includes(x));
      if (before.join() !== after.join()) {
        push(slot.del, target, { card, label: "moved" });
        slot.ins.push({ card, anchor: anchorOf(target), text: txtA.get(target), label: "moved here" });
        touched = true;
      }
    }
    if (card.op === "edit_bullet" && Bk.includes(target) && txtA.get(target) === txtB.get(target) && eB.bullets.find((b) => b.id === target)?.override?.[doc.id]) {
      slot.notes.push({ card, text: "This bullet has its own wording for this doc, so the edit doesn't show here." }); touched = true;
    }
    for (const id of [target, ...newIds]) if (A.cut.some((b) => b.id === id)) {
      slot.notes.push({ card, text: `${card.op === "add_bullet" ? "New bullet" : "This bullet"} won't show in this doc: it's past the ${cap}-bullet limit.` }); touched = true;
    }
    if (touched) m.cards.add(card.id);
  }
  return m;
}

// ---------- HTML ----------
const tag = (t) => (t ? ` <span class="rl-tag">${esc(t)}</span>` : "");

// Ids in a longest common subsequence of two id lists (short lists; plain DP).
function lcs(a, b) {
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out = new Set();
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) { out.add(a[i]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
  }
  return out;
}

// content: what to draw; marks: from docMarks (null = clean); live: published content, for the
// green "accepted since last publish" borders (null = none).
export function renderDoc({ content, doc, marks = null, live = null }) {
  const p = content.profile;
  const entries = new Map(content.entries.map((e) => [e.id, e]));
  const liveEntries = new Map((live?.entries ?? []).map((e) => [e.id, e]));
  const rendered = new Set();
  const liveVal = (key) => {
    if (key.startsWith("profile.")) return getPath(live?.profile, key.slice(8));
    const [eid, ...rest] = key.split(".");
    return getPath(liveEntries.get(eid), rest.join("."));
  };
  const field = (key, value, fmt = (s) => esc(s)) => {
    rendered.add(key);
    const fm = marks?.fields.get(key);
    if (fm?.length) return fm.map((f) => `<span class="rl-mark rl-field" data-card="${esc(f.card.id)}"><del>${fmt(show(f.old))}</del> <ins>${fmt(show(f.new))}</ins></span>`).join(" ");
    const txt = fmt(show(value));
    const entryKnown = key.startsWith("profile.") || liveEntries.has(key.split(".")[0]);
    return live && entryKnown && show(liveVal(key)) !== show(value) && txt ? `<span class="rl-acc-f">${txt}</span>` : txt;
  };
  const link = (key, v) => (v || marks?.fields.has(key) ? `<u>${field(key, v)}</u>` : "");

  const out = [];
  out.push(`<header class="rl-head"><div class="rl-name">${field("profile.name", p.name)}</div><div class="rl-contact">${
    [p.phone || marks?.fields.has("profile.phone") ? field("profile.phone", p.phone) : "", link("profile.email", p.email), link("profile.site", p.site), link("profile.linkedin", p.linkedin)]
      .filter(Boolean).join(" | ")}</div></header>`);

  out.push(`<h2>Education</h2>`);
  (p.education ?? []).forEach((ed, i) => {
    if (ed.docs && !ed.docs.includes(doc.id)) return;   // e.g. high school: CV only
    const k = (f) => `profile.education.${i}.${f}`;
    out.push(`<div class="rl-item"><div class="rl-row"><b>${field(k("school"), ed.school)}</b><span>${field(k("dates"), ed.dates)}</span></div>
      <div class="rl-row rl-sub"><i>${field(k("degree"), ed.degree)}${ed.gpa || marks?.fields.has(k("gpa")) ? `, GPA: ${field(k("gpa"), ed.gpa)}` : ""}</i><i>${field(k("location"), ed.location)}</i></div>
      ${ed.note ? `<div class="rl-sub rl-edu-note"><i>${field(k("note"), ed.note)}</i></div>` : ""}</div>`);
  });

  const bulletLis = (e, isNew) => {
    const sel = selectBullets(doc, e);
    const lis = [];
    const slot = isNew ? null : marks?.bullets.get(e.id);
    const le = liveEntries.get(e.id);
    // Bullets that kept their order relative to live; anything outside this was moved since publish.
    const inOrder = le ? lcs(selectBullets(doc, le).kept.map((b) => b.id), sel.kept.map((b) => b.id)) : new Set();
    const ins = (x) => `<li class="rl-mark rl-ins" data-card="${esc(x.card.id)}"><ins>${richHtml(x.text)}</ins>${tag(x.label)}</li>`;
    slot?.ins.filter((x) => x.anchor === null).forEach((x) => lis.push(ins(x)));
    for (const b of sel.kept) {
      const text = richHtml(bulletText(b, doc));
      const dels = slot?.del.get(b.id) ?? [], edits = slot?.edit.get(b.id) ?? [];
      if (dels.length || edits.length) {
        const first = (edits[0] ?? dels[0]).card.id;
        lis.push(`<li class="rl-mark ${edits.length ? "rl-edit" : "rl-del"}" data-card="${esc(first)}"><del>${text}</del>${
          edits.map((x) => `<ins data-card="${esc(x.card.id)}">${richHtml(x.text)}</ins>`).join("")}${dels.map((d) => tag(d.label)).join("")}</li>`);
      } else {
        const lb = le?.bullets?.find((x) => x.id === b.id);
        const accepted = live && le && (!lb || bulletText(lb, doc) !== bulletText(b, doc) || !inOrder.has(b.id));
        lis.push(`<li${accepted ? ' class="rl-acc"' : ""}>${text}</li>`);
      }
      slot?.ins.filter((x) => x.anchor === b.id).forEach((x) => lis.push(ins(x)));
    }
    const notes = (slot?.notes ?? []).map((n) => `<div class="rl-mark rl-note" data-card="${esc(n.card.id)}">${esc(n.text)}</div>`);
    return (lis.length ? `<ul>${lis.join("")}</ul>` : "") + notes.join("");
  };

  const head = (e, plain) => {
    const f = plain ? (_k, v, fmt = (s) => esc(s)) => fmt(show(v)) : field;
    const k = (x) => `${e.id}.${x}`;
    return e.stack
      ? `<div class="rl-row"><span><b>${f(k("title"), e.title)}</b> | <i class="rl-stack">${f(k("stack"), e.stack)}</i></span><span>${f(k("dates"), e.dates)}</span></div>`
      : `<div class="rl-row"><b>${f(k("title"), e.title)}</b><span>${f(k("dates"), e.dates)}</span></div>
         <div class="rl-row rl-sub"><i>${f(k("org"), e.org)}</i><i>${f(k("location"), e.location)}</i></div>`;
  };
  // Docs with `summaries: true` (the CV) print an entry's summary paragraph above its bullets and
  // its link below them.
  const extra = (x, cls, tagName) => (e, plain) => {
    if (!doc.summaries) return "";
    const key = `${e.id}.${x}`;
    if (!e[x] && (plain || !marks?.fields.has(key))) return "";
    return `<${tagName} class="${cls}">${plain ? richHtml(show(e[x])) : field(key, e[x], richHtml)}</${tagName}>`;
  };
  const summary = extra("summary", "rl-summary", "p"), linkLine = extra("link", "rl-sub rl-link", "div");

  // A "list" section: one profile list (strings, or {title, detail, dates} objects). Drawn as divs,
  // not <li>, so bullets stay the only list items. A card replacing the whole list shows as one mark.
  const listSection = (s) => {
    const key = `profile.${s.from}`;
    const v = p[s.from];
    if (marks?.fields.has(key)) return `<div class="rl-list">${field(key, v)}</div>`;
    rendered.add(key);
    const items = Array.isArray(v) ? v : v ? [v] : [];
    if (s.style === "inline") return `<div class="rl-list rl-inline">${field(key, items)}</div>`;
    return `<div class="rl-list">${items.map((a, i) => {
      const ik = (x) => `${key}.${i}${x ? `.${x}` : ""}`;
      if (!a || typeof a !== "object") return `<div class="rl-row">${field(ik(), a, richHtml)}</div>`;
      return `<div class="rl-row"><span>${field(ik("title"), a.title, richHtml)}${a.detail ? `, <i>${field(ik("detail"), a.detail, richHtml)}</i>` : ""}</span><span>${a.dates ? field(ik("dates"), a.dates) : ""}</span></div>`;
    }).join("")}</div>`;
  };

  for (const s of doc.sections) {
    // An empty list section is left out, same as the TeX build, unless a card is filling it.
    if (s.kind === "list" && !show(p[s.from]) && !marks?.fields.has(`profile.${s.from}`)) continue;
    out.push(`<h2>${esc(s.title)}</h2>`);
    if (s.kind === "skills") {
      out.push(`<div class="rl-skills">${Object.entries(p.skills ?? {}).map(([k, v]) =>
        `<div><b>${esc(k)}</b>: ${field(`profile.skills.${k}`, v, richHtml)}</div>`).join("")}</div>`);
      continue;
    }
    if (s.kind === "list") { out.push(listSection(s)); continue; }
    for (const id of s.entries ?? []) {
      const e = entries.get(id);
      if (!e) continue;
      const newSinceLive = live && !liveEntries.has(id);
      out.push(`<div class="rl-item${newSinceLive ? " rl-acc-block" : ""}">${head(e, false)}${summary(e, false)}${bulletLis(e, false)}${linkLine(e, false)}</div>`);
    }
    for (const x of (marks?.entries ?? []).filter((x) => x.section === s.title)) {
      const note = x.guessed ? `The card didn't say where this goes, so it's placed at the end of ${s.title}.` : "";
      const cut = x.cut.length ? `${x.cut.length} bullet${x.cut.length > 1 ? "s" : ""} past the ${doc.max_bullets}-bullet limit won't show in this doc.` : "";
      out.push(`<div class="rl-mark rl-entry" data-card="${esc(x.card.id)}"><div class="rl-entry-tag">New entry <code>${esc(x.entry.id)}</code>${note ? ` · ${esc(note)}` : ""}</div>
        ${head(x.entry, true)}${summary(x.entry, true)}${x.kept.length ? `<ul>${x.kept.map((b) => `<li>${richHtml(bulletText(b, doc))}</li>`).join("")}</ul>` : ""}${linkLine(x.entry, true)}${cut ? `<div class="rl-note">${esc(cut)}</div>` : ""}</div>`);
    }
  }

  const unplaced = [...(marks?.fields ?? new Map())].filter(([k]) => !rendered.has(k)).flatMap(([k, fs]) =>
    fs.map((f) => ({ card: f.card, text: `${k}: "${show(f.old)}" → "${show(f.new)}"` })));
  const other = [...(marks?.other ?? []), ...unplaced];
  return {
    html: `<article class="rl-paper rl-${esc(doc.template)}">${out.join("\n")}</article>`,
    other: other.map((o) => `<div class="rl-mark rl-other" data-card="${esc(o.card.id)}">${esc(o.text)}</div>`).join(""),
    count: marks?.cards.size ?? 0,
  };
}
