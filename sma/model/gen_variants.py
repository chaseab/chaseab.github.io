"""Generate the adjustable-carriage motion dataset.

For each carriage pin height (free SMA length), rebuild the rig, then sweep the
SMA contraction KINEMATICALLY: at each commanded strain s, solve the ankle angle
whose active-side tendon length == L0*(1-s) (bisection; length is monotonic in
theta). SMA max strain ~4.4% == the +/-0.8 rad joint stop for the default rig, so
a SHORTER free length reaches a smaller angle (can't hit the stop) => smaller ROM;
a LONGER free length saturates at the stop. Exports foot.glb once,
static_<k>.glb + anim_<k>.json per pin, and manifest.json.

Run with the venv python (mujoco + trimesh)."""
import os, sys, json, subprocess, numpy as np, mujoco, trimesh

PY = "py"
CARRIAGE_YS = [7.4, 8.3, 9.2, 10.1]   # pin heights (assembly in) = free length
SMA_SPEC = (0.04, 0.06)               # datasheet recoverable-strain range
STRAIN = SMA_SPEC[1]                   # ramp to the 6% upper spec; viewer caps in [4,6]%
DT_REC = 0.03
NF_RAMP, NF_REL = 30, 16              # frames per ramp / release
PLANE, HFIELD, SPHERE, CAPSULE, ELLIPSOID, CYLINDER, BOX, MESH = range(8)

def smooth(u):
    return u*u*(3-2*u)

def geom_mesh(m, i):
    gt = int(m.geom_type[i])
    if gt == MESH:
        did = int(m.geom_dataid[i])
        va, vn = int(m.mesh_vertadr[did]), int(m.mesh_vertnum[did])
        fa, fn = int(m.mesh_faceadr[did]), int(m.mesh_facenum[did])
        mv = np.asarray(m.mesh_vert).reshape(-1, 3); mf = np.asarray(m.mesh_face).reshape(-1, 3)
        return trimesh.Trimesh(vertices=mv[va:va+vn].copy(), faces=mf[fa:fa+fn].copy(), process=False)
    if gt == CYLINDER:
        return trimesh.creation.cylinder(radius=float(m.geom_size[i,0]), height=2*float(m.geom_size[i,1]), sections=18)
    if gt == BOX:
        return trimesh.creation.box(extents=2*np.asarray(m.geom_size[i,:3]))
    if gt == SPHERE:
        return trimesh.creation.icosphere(radius=float(m.geom_size[i,0]))
    return None

def bake(m, d, which, offset, foot_bid):
    scene = trimesh.Scene()
    for i in range(m.ngeom):
        is_foot = int(m.geom_bodyid[i]) == foot_bid
        if (which == "foot") != is_foot:
            continue
        g = geom_mesh(m, i)
        if g is None:
            continue
        T = np.eye(4); T[:3, :3] = np.asarray(d.geom_xmat[i]).reshape(3, 3)
        T[:3, 3] = np.asarray(d.geom_xpos[i]) - offset
        g.apply_transform(T)
        rgba = (np.asarray(m.geom_rgba[i]) * 255).astype(np.uint8)
        g.visual.vertex_colors = np.tile(rgba, (len(g.vertices), 1))
        scene.add_geometry(g)
    return scene

def build_rig(cy):
    env = dict(os.environ, CARRIAGE_Y=str(cy))
    r = subprocess.run([PY, "-3.10", "build_v2_rig.py"], env=env, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout, r.stderr); sys.exit(1)

settings = []
foot_done = False
for k, cy in enumerate(CARRIAGE_YS):
    build_rig(cy)
    m = mujoco.MjModel.from_xml_path("v2_rig.xml")
    d = mujoco.MjData(m); mujoco.mj_forward(m, d)
    foot_bid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, "foot")
    PIVOT = np.asarray(d.xpos[foot_bid]).copy()
    ankle_id = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, "ankle")
    qadr = int(m.jnt_qposadr[ankle_id])
    JLIM = float(m.jnt_range[ankle_id, 1])

    if not foot_done:
        bake(m, d, "foot", PIVOT, foot_bid).export("foot.glb")
        foot_done = True
    bake(m, d, "static", np.zeros(3), foot_bid).export(f"static_{k}.glb")

    toe_ten = [t for t in range(m.ntendon) if m.tendon(t).name.startswith("w_toe")]
    heel_ten = [t for t in range(m.ntendon) if m.tendon(t).name.startswith("w_heel")]
    tendon_rgba = [np.asarray(m.tendon_rgba[t])[:3].round(3).tolist() for t in range(m.ntendon)]

    def set_theta(th):
        d.qpos[qadr] = th; mujoco.mj_forward(m, d)

    def mean_len(idx):
        return float(np.mean([d.ten_length[t] for t in idx]))

    set_theta(0.0)
    L0_toe = mean_len(toe_ten); L0_heel = mean_len(heel_ten)

    def theta_for_strain(idx, L0i, s, lo, hi):
        target = L0i * (1.0 - s)
        set_theta(lo); llo = mean_len(idx)
        set_theta(hi); lhi = mean_len(idx)
        if not (min(llo, lhi) <= target <= max(llo, lhi)):
            return lo if llo < lhi else hi          # clamp to shortest-length limit
        a, b = lo, hi
        for _ in range(40):
            mid = 0.5*(a+b); set_theta(mid); lm = mean_len(idx)
            if (lm - target) * (llo - target) > 0:
                a, llo = mid, lm
            else:
                b, lhi = mid, lm
        return 0.5*(a+b)

    def polys():
        wx = np.asarray(d.wrap_xpos).reshape(-1, 3); out = []
        for t in range(m.ntendon):
            a0, n = int(d.ten_wrapadr[t]), int(d.ten_wrapnum[t])
            out.append([[round(float(v), 4) for v in p] for p in wx[a0:a0+n]])
        return out

    def frame(theta, active, s, side):
        set_theta(theta)
        act = [0.0]*m.ntendon
        for t in active:
            act[t] = round(s/STRAIN, 3)
        return {"ankle": round(float(theta), 5), "strain": round(float(s), 4),
                "side": side, "act": act, "tendons": polys()}

    # monotonic strain->geometry lookup per side (0 -> STRAIN); JS walks it both
    # ways as the SMA heats (contract) and cools (relax).
    NLK = 44
    frames = []
    for f in range(NLK):              # toe contract -> plantarflex (theta<0)
        s = STRAIN*f/(NLK-1)
        frames.append(frame(theta_for_strain(toe_ten, L0_toe, s, -JLIM, 0.0), toe_ten, s, "toe"))
    for f in range(NLK):             # heel contract -> dorsiflex (theta>0)
        s = STRAIN*f/(NLK-1)
        frames.append(frame(theta_for_strain(heel_ten, L0_heel, s, 0.0, JLIM), heel_ten, s, "heel"))

    def rom_at(sv):
        p = np.degrees(theta_for_strain(toe_ten, L0_toe, sv, -JLIM, 0.0))
        dd = np.degrees(theta_for_strain(heel_ten, L0_heel, sv, 0.0, JLIM))
        return round(abs(p)+abs(dd),1), round(abs(p),1), round(abs(dd),1)
    rom4, p4, d4 = rom_at(SMA_SPEC[0])
    rom6, p6, d6 = rom_at(SMA_SPEC[1])
    free_mm = L0_toe * 1000
    json.dump({"pivot": [round(float(x),5) for x in PIVOT], "axis": [0,-1,0],
               "dt": DT_REC, "specMin": SMA_SPEC[0], "specMax": SMA_SPEC[1],
               "tendonColors": tendon_rgba, "frames": frames},
              open(f"anim_{k}.json", "w"))
    settings.append({"pinY_in": cy, "freeLen_mm": round(free_mm,1),
                     "rom4_deg": rom4, "rom6_deg": rom6,
                     "plantar4": p4, "dorsi4": d4, "plantar6": p6, "dorsi6": d6,
                     "static": f"static_{k}.glb", "anim": f"anim_{k}.json"})
    print(f"pin Y={cy}in free={free_mm:.0f}mm  ROM@4%={rom4}deg  ROM@6%={rom6}deg")

json.dump({"foot": "foot.glb", "specMin": SMA_SPEC[0], "specMax": SMA_SPEC[1],
           "settings": settings}, open("manifest.json", "w"))
build_rig(8.9)
print("wrote manifest.json + foot.glb + static_*/anim_*; default rig restored")
