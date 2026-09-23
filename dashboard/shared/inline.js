// Inline markup in bullet text: *italic* and bare site URLs. Both the TeX renderer and the
// dashboard's HTML redline tokenize with this, so they agree on what is a link. Dependency-free
// (shared verbatim as dashboard/shared/inline.js).

const LINK = /((?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|org|io|edu|net|dev)(?:\/[^\s,;)]*[^\s,;).])?)/gi;

// -> [{t:"text"|"italic", s}, {t:"link", s, href}]
export function inlineTokens(str) {
  const out = [];
  String(str ?? "").split(LINK).forEach((part, i) => {
    if (i % 2 === 1) { out.push({ t: "link", s: part, href: /^https?:/.test(part) ? part : `https://${part}` }); return; }
    part.split(/\*([^*]+)\*/).forEach((p, j) => { if (p) out.push({ t: j % 2 ? "italic" : "text", s: p }); });
  });
  return out;
}
