"""Audit every local asset reference in the deployed site against a live URL."""
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, unquote, urljoin
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

OUT = r"C:\portfolio-deploy"
BASE = sys.argv[1].rstrip("/") + "/"

ATTR_RE = re.compile(r"""(?:src|href|poster|data-src)\s*=\s*["']([^"']+)["']""", re.I)
CSSURL_RE = re.compile(r"""url\(\s*['"]?([^)'"]+?)['"]?\s*\)""", re.I)

SKIP_PREFIX = ("http://", "https://", "//", "data:", "mailto:", "tel:", "#", "javascript:")


def refs_from(path, relroot):
    text = open(path, "r", encoding="utf-8", errors="replace").read()
    rx = CSSURL_RE if path.lower().endswith(".css") else ATTR_RE
    out = set()
    for m in rx.finditer(text):
        r = m.group(1).strip()
        if not r or r.startswith(SKIP_PREFIX) or "${" in r or "*" in r:
            continue
        r = r.split("#")[0].split("?")[0]
        if not r:
            continue
        if r.startswith("/"):
            url = r.lstrip("/")
        else:
            url = os.path.normpath(os.path.join(relroot, r)).replace(os.sep, "/")
        out.add((url, os.path.relpath(path, OUT)))
    return out


def collect():
    all_refs = set()
    for root, _d, files in os.walk(OUT):
        for fn in files:
            if not fn.lower().endswith((".html", ".css")):
                continue
            p = os.path.join(root, fn)
            relroot = os.path.relpath(root, OUT).replace("\\", "/")
            relroot = "" if relroot == "." else relroot
            all_refs |= refs_from(p, relroot)
    return sorted(all_refs)


def check(item):
    url, src = item
    # Re-encode spaces/parens but keep the slashes.
    enc = quote(unquote(url), safe="/._-~()!$&'*+,;=:@")
    full = urljoin(BASE, enc)
    try:
        req = Request(full, method="HEAD")
        with urlopen(req, timeout=30) as r:
            return (r.status, url, src)
    except HTTPError as e:
        return (e.code, url, src)
    except (URLError, OSError) as e:
        return (0, url, "%s (%s)" % (src, e))


def main():
    refs = collect()
    print("checking %d unique local refs against %s" % (len(refs), BASE))
    with ThreadPoolExecutor(max_workers=16) as ex:
        results = list(ex.map(check, refs))
    bad = [r for r in results if r[0] != 200]
    ok = len(results) - len(bad)
    print("[OK] %d refs resolve 200" % ok)
    if bad:
        print("[FAIL] %d broken refs:" % len(bad))
        for code, url, src in sorted(bad):
            print("  %s  %s   <- %s" % (code, url, src))
    return 0


if __name__ == "__main__":
    sys.exit(main())
