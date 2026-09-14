"""Build a pruned Netlify deploy dir from the portfolio repo.

Copies git-tracked files (minus server-side cruft) plus ONLY the images that
are actually referenced by the HTML/CSS/JS. The full assets/imgs junction is
3.6 GB; the referenced subset is ~150 MB.
"""
import os
import re
import shutil
import subprocess
import sys
from urllib.parse import unquote

SRC = r"C:\Users\Chase\onedrive\desktop\portfolio"
IMGS = r"C:\portfolio-media\imgs"
OUT = r"C:\portfolio-deploy"

# Server-side / build-time files that mean nothing on a static CDN.
EXCLUDE = {
    "contact-form-process.php",
    ".htaccess",
    "wp-cli.yml",
    "gulpfile.js",
    "package.json",
    "dev.cmd",
    "chase",
    "README.txt",
    "CMS-SETUP-GUIDE.md",
    "ROV-REDESIGN-BRIEF.md",
    # Unauthenticated CMS admin UI that POSTs to api/publish-project.php.
    # The PHP endpoint does not exist on Netlify, and this should not be public.
    "project-admin.html",
    # These deploy scripts themselves.
    "build-deploy.py",
    "audit-deploy.py",
}

# Untracked files that still belong in the deploy.
EXTRA = ["netlify.toml"]

SCAN_EXT = (".html", ".css", ".js")
# Real filenames contain spaces and parens ("Front View 1.jpg", "IMG_5411 (1).JPG"),
# so delimit on the quote, not on whitespace. Two forms: quoted attributes/strings,
# and bare css url(...).
QUOTED_RE = re.compile(r"""["']([^"']*?imgs/[^"']*)["']""", re.IGNORECASE)
CSS_URL_RE = re.compile(r"""url\(\s*([^)"']*imgs/[^)"']*?)\s*\)""", re.IGNORECASE)
# Pull the path that follows the imgs/ root out of whatever we matched.
TAIL_RE = re.compile(r"""(?:assets/imgs|\.\./imgs|/imgs)/(.+)$""", re.IGNORECASE)


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files"], cwd=SRC, capture_output=True, text=True, check=True
    ).stdout
    return [p for p in out.splitlines() if p.strip()] + EXTRA


def main():
    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    copied = 0
    for rel in tracked_files():
        if os.path.basename(rel) in EXCLUDE or rel in EXCLUDE:
            continue
        src = os.path.join(SRC, rel.replace("/", os.sep))
        if not os.path.isfile(src):
            print("[skip] tracked but absent:", rel)
            continue
        dst = os.path.join(OUT, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        copied += 1
    print("[OK] copied %d site files" % copied)

    # Scan what we just copied for image references.
    refs = set()
    for root, _dirs, files in os.walk(OUT):
        for fn in files:
            if not fn.lower().endswith(SCAN_EXT):
                continue
            path = os.path.join(root, fn)
            try:
                text = open(path, "r", encoding="utf-8", errors="replace").read()
            except OSError:
                continue
            for rx in (QUOTED_RE, CSS_URL_RE):
                for m in rx.finditer(text):
                    raw = m.group(1).strip()
                    # Remote CDN copies (ImageKit) are served by that CDN, not us.
                    if raw.startswith(("http://", "https://", "//")):
                        continue
                    tail = TAIL_RE.search(raw)
                    if not tail:
                        continue
                    ref = unquote(tail.group(1)).split("?")[0].split("#")[0].strip()
                    # Skip template literals / glob patterns.
                    if "${" in ref or "*" in ref or not ref:
                        continue
                    refs.add(ref.replace("/", os.sep))

    print("[OK] found %d distinct image references" % len(refs))

    total = 0
    missing = []
    for ref in sorted(refs):
        src = os.path.join(IMGS, ref)
        if not os.path.isfile(src):
            missing.append(ref)
            continue
        dst = os.path.join(OUT, "assets", "imgs", ref)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        total += os.path.getsize(src)

    print("[OK] copied %d images, %.1f MB" % (len(refs) - len(missing), total / 1048576.0))
    if missing:
        print("[WARN] %d referenced images not found on disk:" % len(missing))
        for m in missing:
            print("   -", m)
    return 0


if __name__ == "__main__":
    sys.exit(main())
