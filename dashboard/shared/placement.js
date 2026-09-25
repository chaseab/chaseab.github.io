// Where an add_entry card's new entry goes in each doc. Explicit {doc, section} placements win;
// otherwise guess: every doc that has a bullet tagged for it (or that the card names), at the end of
// the section that fits (Projects for entries with a stack, Research, else Experience).
// Shared verbatim with the dashboard (dashboard/shared/placement.js).
import { applyCard, StaleCard } from "./cards.js";

export function placementsFor(card, docs) {
  const explicit = (card.docs ?? []).filter((p) => p && typeof p === "object" && p.doc && p.section);
  if (explicit.length) return explicit.map((p) => ({ doc: p.doc, section: p.section, guessed: false }));
  const e = card.entry ?? {};
  const named = (card.docs ?? []).filter((d) => typeof d === "string");
  const out = [];
  for (const doc of docs) {
    const tagged = (e.bullets ?? []).some((b) => (b.tags ?? []).includes(doc.tag));
    if (named.length ? !named.includes(doc.id) : !tagged) continue;
    const titles = doc.sections.filter((s) => (s.kind ?? "entries") === "entries").map((s) => s.title);
    const want = e.stack ? /project/i : /research/i.test(`${e.org ?? ""} ${e.title ?? ""}`) ? /research/i : /experience/i;
    // "Research Experience" is not where a non-research role goes.
    const fits = (t) => want.test(t) && !(want.source === "experience" && /research/i.test(t));
    const section = titles.find(fits) ?? titles.find((t) => /project/i.test(t)) ?? titles[titles.length - 1];
    if (section) out.push({ doc: doc.id, section, guessed: true });
  }
  return out;
}

// applyCard plus, for add_entry, appending the new entry to its doc sections.
// content = {profile, entries, docs}. Returns applyCard's result plus docs: [ids of docs changed].
export function applyCardPlaced(content, card) {
  const changed = applyCard(content, card);
  if (card.op !== "add_entry") return changed;
  const docs = [];
  for (const p of placementsFor(card, content.docs ?? [])) {
    const doc = content.docs.find((d) => d.id === p.doc);
    const sec = doc?.sections.find((s) => s.title === p.section);
    if (!sec) throw new StaleCard(`no section "${p.section}" in doc ${p.doc}`);
    sec.entries ??= [];
    if (!sec.entries.includes(card.entry.id)) { sec.entries.push(card.entry.id); docs.push(doc.id); }
  }
  return { ...changed, docs };
}
