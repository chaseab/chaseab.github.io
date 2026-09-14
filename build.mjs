// Copies the static site into dist/ for Netlify, skipping files that are
// dead on a static host (PHP, CMS admin, gulp tooling) or not meant to be public.
import { cpSync, rmSync, readdirSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const SKIP = new Set([
  ".git", ".gitignore", ".netlify", "dist", "node_modules",
  "build.mjs", "netlify.toml", "package.json", "package-lock.json", "gulpfile.js",
  "CMS-SETUP-GUIDE.md", "README.txt", "chase",
  "api", "contact-form-process.php", "contact-form.css",
  "project-admin.html", "project-template.html", "components.html",
  "scss",
]);

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const entry of readdirSync(".")) {
  if (SKIP.has(entry)) continue;
  cpSync(entry, join("dist", entry), {
    recursive: true,
    filter: (src) => !SKIP.has(basename(src)),
  });
}
console.log("built dist/");
