// Which bullets each document shows. Shared verbatim with the dashboard (dashboard/shared/select.js,
// synced by `npm run sync-dashboard`), so the redline and the PDFs always agree. Keep it dependency-free.

// Bullets of one entry for one doc: tag filter, then the doc's max_bullets cap.
export function selectBullets(doc, entry) {
  const tagged = (entry.bullets ?? []).filter((b) => (b.tags ?? []).includes(doc.tag));
  const n = doc.max_bullets || tagged.length;
  return { kept: tagged.slice(0, n), cut: tagged.slice(n) };
}

// The text a doc prints for a bullet (per-doc override wins).
export const bulletText = (b, doc) => b.override?.[doc.id] ?? b.text;

export function selectDoc(doc, entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const sections = doc.sections.map((s) => ({
    title: s.title,
    kind: s.kind ?? "entries",          // "skills" renders profile.skills here instead of entries
    items: (s.entries ?? []).map((id) => {
      const e = byId.get(id);
      if (!e) throw new Error(`doc ${doc.id}: unknown entry "${id}"`);
      return { ...e, bullets: selectBullets(doc, e).kept.map((b) => bulletText(b, doc)) };
    }),
  }));
  return { ...doc, sections };
}
