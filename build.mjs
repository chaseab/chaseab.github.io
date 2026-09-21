// Builds dist/ for Netlify:
//  1. copies the site, skipping files that are dead on a static host (PHP, CMS admin,
//     gulp tooling) or not meant to be public;
//  2. prunes media under assets/ that no html/css/js file references (by basename),
//     so old originals and unused photos don't ship.
import { cpSync, rmSync, readdirSync, mkdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";

const SKIP = new Set([
  ".git", ".gitignore", ".claude", ".netlify", "dist", "node_modules",
  "build.mjs", "netlify.toml", "package.json", "package-lock.json", "gulpfile.js",
  "CMS-SETUP-GUIDE.md", "README.txt", "chase",
  "api", "contact-form-process.php",
  "project-admin.html", "project-template.html", "components.html", "arcagithree.html",
  "scss", "netlify",
]);
const MEDIA = /\.(jpe?g|png|webp|gif|mp4|mov|pdf|svg)$/i;

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const entry of readdirSync(".")) {
  if (SKIP.has(entry)) continue;
  cpSync(entry, join("dist", entry), { recursive: true, filter: (src) => !SKIP.has(basename(src)) });
}

const walk = (d) => readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const files = walk("dist");
const corpus = files.filter((f) => /\.(html|css|js|json)$/i.test(f)).map((f) => readFileSync(f, "utf8")).join("\n")
  .replace(/https?:\/\/[^\s"')]+/g, ""); // an external URL must not keep a same-named local file alive

let pruned = 0, prunedBytes = 0;
for (const f of files) {
  if (!MEDIA.test(f) || !/[\\/]assets[\\/]/.test(f)) continue;
  const b = basename(f);
  if (corpus.includes(b) || corpus.includes(encodeURI(b)) || corpus.includes(encodeURIComponent(b))) continue; // refs may be URL-encoded
  prunedBytes += statSync(f).size; unlinkSync(f); pruned++;
}
const kept = walk("dist").reduce((s, f) => s + statSync(f).size, 0);
console.log(`built dist/: ${(kept / 1048576).toFixed(1)} MB (pruned ${pruned} unreferenced media files, ${(prunedBytes / 1048576).toFixed(1)} MB)`);
