#!/usr/bin/env python3
"""Export ARC-AGI-3 v11 A/B transcripts -> compact web JSON for the portfolio
Replay Theater. Style-independent build step. ASCII-only stdout (cp1252 console).

Input : scratch/kaggle_fullstack/vlm_out_v11/out_transcripts/transcript_<env>.jsonl
Output: portfolio/data/replay_<env>.json  (+ manifest.json)

Each output episode:
  meta   : env, n_steps, max_levels, verdict_counts, caption, role
  frames : list of 4096-char strings (row-major, one hex char per cell, 0..f)
  steps  : per-step {i, action, source, levels, judge?, goal?, cot[], marker?}

The frames are re-derived ground truth (the persisted engine frames). CoT and
judge text are the loop's own words -- shown, never used to alter the frames.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "scratch", "kaggle_fullstack", "vlm_out_v11", "out_transcripts")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

# env -> (role, honest caption) -- from the audited design doc, do not embellish
EPISODES = {
    "wa30": (
        "most-progress",
        "The loop closes the gap to the target and the judge confirms it is moving "
        "the right object the right way -- then it overshoots and oscillates "
        "(28 TOWARD / 24 AWAY), never landing the exact alignment.",
    ),
    "tu93": (
        "direction-tunneling",
        "Legible step-by-step navigation reasoning, but the executor tunnels on one "
        "direction (RIGHT x21) and re-probes the same corridor instead of the "
        "untried goal-ward path -- it never reaches the target row.",
    ),
    "re86": (
        "thesis-exhibit",
        "Correct goal, correct target -- but the plan mislabels the control "
        "direction ('up' for a button that goes right), so the group is steered the "
        "wrong way. A perception-to-language bug, not a reasoning failure.",
    ),
}

_HEX = "0123456789abcdef"


def encode_frame(frame):
    """64x64 int grid -> 4096-char row-major hex string. Clamp to 0..15."""
    out = []
    for row in frame:
        for v in row:
            iv = int(v)
            out.append(_HEX[iv] if 0 <= iv <= 15 else "0")
    return "".join(out)


def clean(s, n=600):
    if not s:
        return ""
    s = str(s).replace("\r", " ").replace("\n", " ").strip()
    while "  " in s:
        s = s.replace("  ", " ")
    return s[:n]


def cot_text(rec):
    """Pull the most human-readable prose from an llm_call's parsed output."""
    po = rec.get("parsed_output")
    if isinstance(po, dict):
        for k in ("objective", "goal", "effect", "why", "plan", "rationale",
                  "next_action_reason", "reasoning", "summary"):
            v = po.get(k)
            if isinstance(v, str) and v.strip():
                return clean(v)
    r = rec.get("reasoning")
    if isinstance(r, str) and r.strip():
        return clean(r)
    return clean(rec.get("raw_response"))


STAGE_LABEL = {
    "perceive_see": "perceive",
    "abducer": "abduct goal",
    "control_reason": "control",
    "executor": "plan / act",
}


def build_env(env):
    path = os.path.join(SRC, "transcript_%s.jsonl" % env)
    recs = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]

    frames = []
    steps = []
    step_by_i = {}
    verdicts = {}

    # PASS 1: materialize every step + frame first, so step_by_i is complete
    # before we attach anything. (In the transcript, some llm_call records are
    # emitted ahead of their step record in file order.)
    for r in recs:
        if r.get("kind") == "step" and r.get("frame"):
            i = len(frames)
            frames.append(encode_frame(r["frame"]))
            act = r.get("action")
            st = {
                "i": i,
                "step": r.get("step"),
                "levels": r.get("levels", 0),
                "action": act[0] if isinstance(act, list) and act else act,
                "source": r.get("source") or r.get("phase"),
                "cot": [],
            }
            steps.append(st)
            step_by_i[r.get("step")] = st

    # PASS 2: attach CoT / judge / markers. cur_i tracks the latest step seen in
    # file order (for records that carry no step number of their own).
    cur_i = -1
    for r in recs:
        kind = r.get("kind")

        if kind == "step" and r.get("frame"):
            cur_i = step_by_i[r.get("step")]["i"]

        elif kind == "llm_call" and r.get("method") == "complete":
            stage = r.get("stage")
            if stage not in STAGE_LABEL:
                continue
            txt = cot_text(r)
            if not txt:
                continue
            tgt = step_by_i.get(r.get("step"))
            if tgt is None and 0 <= cur_i < len(steps):
                tgt = steps[cur_i]
            if tgt is not None and len(tgt["cot"]) < 4:
                tgt["cot"].append({"stage": STAGE_LABEL[stage], "text": txt})

        elif kind == "v2_judge":
            v = r.get("verdict")
            verdicts[v] = verdicts.get(v, 0) + 1
            if 0 <= cur_i < len(steps):
                steps[cur_i]["judge"] = {
                    "verdict": v,
                    "conf": r.get("confidence"),
                    "why": clean(r.get("trajectory"), 400),
                }
                g = r.get("goal")
                if g:
                    steps[cur_i]["goal"] = clean(g, 400)

        elif kind in ("v2_goal_install", "v2_reabduce", "v2_plan_rejected",
                      "v2_level_retry"):
            label = {
                "v2_goal_install": "goal installed",
                "v2_reabduce": "re-abduces goal (%s)" % clean(r.get("cause"), 40),
                "v2_plan_rejected": "plan rejected",
                "v2_level_retry": "level retry",
            }[kind]
            if 0 <= cur_i < len(steps):
                steps[cur_i].setdefault("markers", []).append(label)

    # controllable-object path: absolute (row,col) re-measured each press
    # (v2_press_event.ctrl_pos_before), tinted by the judge verdict then active.
    # Do NOT integrate shifts -- walls clamp them (verified 35/117 mismatch).
    verdict_by_step = {}
    for s in steps:
        if s.get("judge"):
            verdict_by_step[s["step"]] = s["judge"]["verdict"]
    path = []
    last_v = None
    for r in recs:
        if r.get("kind") == "v2_press_event":
            p = r.get("ctrl_pos_before")
            if not p or p[0] is None:
                continue
            stp = r.get("step")
            if stp in verdict_by_step:
                last_v = verdict_by_step[stp]
            path.append({"step": stp, "r": p[0], "c": p[1], "v": last_v})

    role, caption = EPISODES[env]
    max_levels = max((s["levels"] for s in steps), default=0)
    meta = {
        "env": env,
        "role": role,
        "caption": caption,
        "n_steps": len(steps),
        "max_levels": max_levels,
        "levels_completed": 0,  # audited: 0 ticks across this run
        "verdicts": verdicts,
        "grid": 64,
        "source_file": "scratch/kaggle_fullstack/vlm_out_v11/out_transcripts/transcript_%s.jsonl" % env,
    }
    return {"meta": meta, "frames": frames, "steps": steps, "path": path}


def build_rhae(agent_actions):
    """reports/rhae-calibration.json -> compact per-(env,level) human samples +
    baseline, for the 'you vs 340 humans' beeswarm. agent_actions maps our
    episode envs -> real action count (uncompleted L1)."""
    cal = json.load(open(os.path.join(ROOT, "reports", "rhae-calibration.json"),
                         encoding="utf-8"))
    out = {"envs": {}, "agent": agent_actions, "_meta": cal.get("_meta", {})}
    for env, levels in cal.items():
        if env.startswith("_") or not isinstance(levels, dict):
            continue
        el = {}
        for lvl, d in levels.items():
            if not isinstance(d, dict) or "samples" not in d:
                continue
            el[lvl] = {
                "samples": d.get("samples", []),
                "median": d.get("replay_upper_median", d.get("human_actions")),
                "win_levels": d.get("win_levels"),
            }
        if el:
            out["envs"][env] = el
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    agent_actions = {}
    for env in EPISODES:
        data = build_env(env)
        outpath = os.path.join(OUT, "replay_%s.json" % env)
        with open(outpath, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))
        m = data["meta"]
        agent_actions[env] = m["n_steps"]
        manifest.append({
            "env": env, "role": m["role"], "caption": m["caption"],
            "n_steps": m["n_steps"], "verdicts": m["verdicts"],
            "path_pts": len(data["path"]),
            "file": "data/replay_%s.json" % env,
        })
        kb = os.path.getsize(outpath) / 1024.0
        print("[OK] %s  steps=%d  path=%d  verdicts=%s  %.0f KB"
              % (env, m["n_steps"], len(data["path"]), m["verdicts"], kb))
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"episodes": manifest}, f, indent=1)
    print("[OK] manifest.json (%d episodes)" % len(manifest))

    rhae = build_rhae(agent_actions)
    with open(os.path.join(OUT, "rhae.json"), "w", encoding="utf-8") as f:
        json.dump(rhae, f, separators=(",", ":"))
    print("[OK] rhae.json (%d envs, agent=%s)" % (len(rhae["envs"]), agent_actions))

    # compact paths.json for the failure-shape traces (path + one context frame)
    paths = {"envs": []}
    for env in EPISODES:
        d = build_env(env)
        paths["envs"].append({
            "env": env,
            "role": d["meta"]["role"],
            "grid": 64,
            "path": d["path"],
            "context_frame": d["frames"][-1],  # faint underlay for orientation
        })
    with open(os.path.join(OUT, "paths.json"), "w", encoding="utf-8") as f:
        json.dump(paths, f, separators=(",", ":"))
    print("[OK] paths.json (%d traces)" % len(paths["envs"]))


if __name__ == "__main__":
    sys.exit(main())
