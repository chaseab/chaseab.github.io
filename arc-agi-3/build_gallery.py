#!/usr/bin/env python3
"""Dump the initial frame of every public ARC-AGI-3 env -> data/gallery.json
for the cover-art thumbnail wall. Runs the real engine OFFLINE (no network),
so each thumbnail is a genuine first-frame of the game. ASCII-only stdout.

Run: py -3.14 portfolio/build_gallery.py
Needs arcengine + cached environment_files/ (already present in repo).
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
sys.path.insert(0, os.path.join(ROOT, "src"))

_HEX = "0123456789abcdef"


def enc(frame):
    """(64x64) int grid (list/np) -> 4096-char hex string, clamped 0..15."""
    out = []
    for row in frame:
        for v in row:
            iv = int(v)
            out.append(_HEX[iv] if 0 <= iv <= 15 else "0")
    return "".join(out)


def main():
    os.environ["OPERATION_MODE"] = "offline"
    from arc3.env import make_arcade, _call_with_retry, PUBLIC_ENV_IDS

    arc = make_arcade(offline=True)
    gallery = {"envs": []}
    ok = 0
    for env in PUBLIC_ENV_IDS:
        try:
            game = arc.make(env)
            fd = _call_with_retry(game.reset, max_retries=3, _label="reset:%s" % env)
            frame = fd.frame[-1]  # last animation frame of the initial state
            # normalize numpy -> list
            grid = frame.tolist() if hasattr(frame, "tolist") else frame
            gallery["envs"].append({
                "env": env,
                "frame": enc(grid),
                "win_levels": getattr(fd, "win_levels", None),
            })
            ok += 1
            print("[OK] %s" % env)
        except Exception as e:  # noqa: BLE001 - one bad env must not kill the dump
            print("[SKIP] %s -- %s" % (env, str(e)[:80]))

    with open(os.path.join(OUT, "gallery.json"), "w", encoding="utf-8") as f:
        json.dump(gallery, f, separators=(",", ":"))
    print("[DONE] gallery.json: %d/%d envs" % (ok, len(PUBLIC_ENV_IDS)))


if __name__ == "__main__":
    sys.exit(main())
