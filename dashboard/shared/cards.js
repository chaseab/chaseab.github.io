// Applying one suggestion card to content. Shared verbatim with the dashboard
// (dashboard/shared/cards.js) so the redline previews exactly what the worker will commit. Dependency-free.
export class StaleCard extends Error {}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const getPath = (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj);
const setPath = (obj, path, val) => {
  const ks = path.split("."); const last = ks.pop();
  ks.reduce((o, k) => (o[k] ??= {}), obj)[last] = val;
};

function findEntry(c, id) {
  const e = c.entries.find((x) => x.id === id);
  if (!e) throw new StaleCard(`no entry ${id}`);
  return e;
}
function findBullet(c, target) {
  const [eid, bid] = target.split("/");
  const e = findEntry(c, eid);
  const i = (e.bullets ?? []).findIndex((b) => b.id === bid);
  if (i < 0) throw new StaleCard(`no bullet ${target}`);
  return { e, i, b: e.bullets[i] };
}
const checkBase = (cur, card) => { if (!same(cur, card.base)) throw new StaleCard(`base mismatch on ${card.target}`); };

// Mutates content ({profile, entries}); returns what to save: {entries:[ids]} or {profile:true}.
export function applyCard(c, card) {
  switch (card.op) {
    case "edit_bullet": {
      const { e, b } = findBullet(c, card.target); checkBase(b.text, card);
      b.text = card.after; if (card.edited) b.locked = true;
      return { entries: [e.id] };
    }
    case "add_bullet": {
      const e = findEntry(c, card.target); e.bullets ??= [];
      const b = { id: `${e.id}-${Date.now().toString(36)}`, text: card.after, tags: card.tags ?? ["cv"] };
      if (card.proof) b.proof = card.proof;
      if (card.edited) b.locked = true;
      e.bullets.splice(card.position ?? e.bullets.length, 0, b);
      return { entries: [e.id] };
    }
    case "remove_bullet": {
      const { e, i, b } = findBullet(c, card.target); checkBase(b.text, card);
      e.bullets.splice(i, 1); return { entries: [e.id] };
    }
    case "move_bullet": {
      const { e, i, b } = findBullet(c, card.target); checkBase(b.text, card);
      e.bullets.splice(i, 1); e.bullets.splice(card.position, 0, b); return { entries: [e.id] };
    }
    case "set_field": {
      if (card.target.startsWith("profile.")) {
        const p = card.target.slice(8); checkBase(getPath(c.profile, p), card);
        setPath(c.profile, p, card.after); return { profile: true };
      }
      const [eid, ...rest] = card.target.split("."); const e = findEntry(c, eid); const p = rest.join(".");
      checkBase(getPath(e, p), card); setPath(e, p, card.after); return { entries: [e.id] };
    }
    case "add_entry": {
      if (c.entries.some((x) => x.id === card.entry.id)) throw new StaleCard(`entry ${card.entry.id} exists`);
      c.entries.push(card.entry); return { entries: [card.entry.id] };
    }
    default: throw new StaleCard(`unknown op ${card.op}`);
  }
}
