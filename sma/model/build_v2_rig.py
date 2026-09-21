# Build v2_rig.xml from assembly-positioned STL exports (V2/stlv2/).
# Assembly coords: inches, Y = vertical (up), pivot axis along Z (depth).
#
# Mechanism:
#   - "Base plate" part is the FOOT: pivots about the dot2in pin at center.
#   - M4 bolts stand in the foot's edge hole rows and stick out of the
#     slidable carriage (height_adjust) hole column.
#   - ONE continuous SMA wire zigzags foot-bolt -> under/around the saddle
#     arc -> carriage bolt -> back down. Each turn wraps a bolt shank, so
#     adjacent strands are ~4 mm (bolt dia) apart. Default: 7 strands.
#   - radiusV2 saddles = swappable-radius rockers, move with the foot;
#     the under-arc wrap is what converts wire tension into ankle torque.
import os
import struct

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
STL_DIR = os.path.join(HERE, "..", "V2", "stlv2")
MESH_DIR = os.path.join(HERE, "meshes")
XML_OUT = os.path.join(HERE, "v2_rig.xml")

IN2M = 0.0254


def asm2world(p):
    """Assembly (X, Y-up, Z-depth) inches -> world (X, Y, Z-up) meters."""
    p = np.asarray(p, dtype=np.float64) * IN2M
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


PIVOT = asm2world([3.37, 3.14, 3.30])           # dot2in pin center (ankle)

# Geometry (assembly inches)
FOOT_ROW_X = {"toe": 0.60, "heel": 6.10}        # foot bolt-row X
FOOT_TOP_Y = 3.47                               # top face of foot plate
BOLT_WRAP_Y = FOOT_TOP_Y + 0.15                 # wire wraps bolt shank here
CARRIAGE_Y0 = 8.9                               # carriage height as-modeled in the STL
CARRIAGE_XY = (3.37, float(os.environ.get("CARRIAGE_Y", CARRIAGE_Y0)))  # slidable: Y = pin height (in)
PIN_SETTINGS = [7.4, 8.3, 9.2, 10.1]            # discrete side-pin holes (must match gen_variants)
BOLT_Z = [1.90 + 0.45 * i for i in range(7)]    # foot bolt depths (7 holes)
CARR_Z = [2.125 + 0.45 * i for i in range(6)]   # carriage bolt depths (6)
ARC_R = 1.0                                     # saddle arc radius, in
KEYPIN = {"heel": np.array([4.87, 3.10, 3.30]),
          "toe": np.array([1.87, 3.225, 3.30])}  # saddle pivots
BOLT_R_IN = 0.079                               # M4 shank radius (2 mm), in

# Wire topology: full zigzag over all bolts -> 12 strands, terminated at
# foot bolts 1 and 7 (both ends at the bottom of the foot).
# ('f', i) = foot bolt i, ('c', i) = carriage bolt i.
SEQ = []
for _i in range(6):
    SEQ += [("f", _i), ("c", _i)]
SEQ.append(("f", 6))

PARTS = {
    # file suffix -> (body, rgba)
    "Inital_Test_Rod-3":          ("static", "0.92 0.92 0.90 1"),
    "height_adjust-1":            ("static", "0.20 0.55 0.85 1"),
    "Inital_Test_Base_PlateV2-1": ("foot",   "0.85 0.85 0.88 1"),
    "Initial_Test_dot2inpinV2-1": ("foot",   "0.20 0.20 0.20 1"),
    "keypinV2-1":                 ("foot",   "0.15 0.15 0.15 1"),
    "keypinV2-2":                 ("foot",   "0.15 0.15 0.15 1"),
    "radiusV2-1":                 ("foot",   "0.95 0.95 0.95 1"),
    "radiusV2-2":                 ("foot",   "0.95 0.95 0.95 1"),
}


def read_stl(path):
    data = open(path, "rb").read()
    ntri = struct.unpack("<I", data[80:84])[0]
    tris = np.empty((ntri, 3, 3), np.float64)
    off = 84
    for i in range(ntri):
        v = struct.unpack("<9f", data[off + 12:off + 48])
        tris[i] = np.array(v).reshape(3, 3)
        off += 50
    return tris


def write_stl(path, tris):
    with open(path, "wb") as f:
        f.write(b"\0" * 80)
        f.write(struct.pack("<I", len(tris)))
        for t in tris:
            n = np.cross(t[1] - t[0], t[2] - t[0])
            L = np.linalg.norm(n)
            n = n / L if L > 0 else n
            f.write(struct.pack("<3f", *n))
            for v in t:
                f.write(struct.pack("<3f", *v))
            f.write(b"\0\0")


PLATE_TOP = None  # set in main(): PLATE_TOP(x, z) -> plate top face Y (asm in) at that column


def make_plate_sampler(verts):
    """verts: (N,3) base-plate vertices in assembly inches. Returns a function
    giving the plate's top-face Y directly above an (X, Z) column (bolt hole)."""
    verts = np.asarray(verts, dtype=float)

    def top(x, z):
        for tol in (0.20, 0.30, 0.45, 0.70):
            mask = (np.abs(verts[:, 0] - x) < tol) & (np.abs(verts[:, 2] - z) < tol)
            if mask.any():
                return float(verts[mask, 1].max())
        return float(verts[:, 1].max())
    return top


def under_arc_xy(center, bolt_xy, carr_xy, n=3):
    """Assembly-XY points along the saddle arc underside, bolt->carriage."""
    c = np.array(center[:2], dtype=float)

    def tangent_angle(p):
        v = np.array(p, dtype=float) - c
        d = np.linalg.norm(v)
        base = np.arctan2(v[1], v[0])
        alpha = np.arccos(min(ARC_R / d, 1.0))
        # under-wrap: tangent point with the lower Y
        return min([base + alpha, base - alpha], key=np.sin)

    a0, a1 = tangent_angle(bolt_xy), tangent_angle(carr_xy)
    bot = -np.pi / 2
    a0 -= 2 * np.pi * round((a0 - bot) / (2 * np.pi))
    a1 -= 2 * np.pi * round((a1 - bot) / (2 * np.pi))
    return [c + ARC_R * np.array([np.cos(a), np.sin(a)])
            for a in np.linspace(a0, a1, n)]


def build_side(side, foot_sites, world_sites, foot_geoms, world_geoms):
    """Emit bolts, sites, and the zigzag tendon path for one side."""
    fx = FOOT_ROW_X[side]
    # plate top face at this bolt row (real seated height, per-hole depth Z)
    top_y = {z: PLATE_TOP(fx, z) for z in BOLT_Z}
    row_wrap_y = np.mean([top_y[z] for z in BOLT_Z]) + 0.15  # representative, for arc tangent
    arc_pts = under_arc_xy(KEYPIN[side], (fx, row_wrap_y), CARRIAGE_XY)
    r = BOLT_R_IN

    def fsite(name, asm_pos, rgba="0.9 0.9 0.2 0.6"):
        p = asm2world(asm_pos) - PIVOT
        foot_sites.append(f'      <site name="{name}" pos="{p[0]:.5f} '
                          f'{p[1]:.5f} {p[2]:.5f}" size="0.0018" rgba="{rgba}"/>')

    def wsite(name, asm_pos, rgba="0.2 0.6 1 1"):
        p = asm2world(asm_pos)
        world_sites.append(f'    <site name="{name}" pos="{p[0]:.5f} '
                           f'{p[1]:.5f} {p[2]:.5f}" size="0.0018" rgba="{rgba}"/>')

    # bolt geoms (visual) at every hole: seated in the plate hole (base sunk
    # 0.15in into the plate top) protruding 0.35in above the real plate face
    for i, z in enumerate(BOLT_Z):
        a = asm2world([fx, top_y[z] - 0.15, z]) - PIVOT
        b = asm2world([fx, top_y[z] + 0.35, z]) - PIVOT
        foot_geoms.append(
            f'      <geom type="cylinder" fromto="{a[0]:.5f} {a[1]:.5f} '
            f'{a[2]:.5f}  {b[0]:.5f} {b[1]:.5f} {b[2]:.5f}" size="{r*IN2M:.5f}" '
            f'rgba="0.75 0.6 0.2 1" contype="0" conaffinity="0"/>')
    if side == "toe":  # carriage bolts once (shared column)
        for i, z in enumerate(CARR_Z):
            a = asm2world([CARRIAGE_XY[0] - 0.25, CARRIAGE_XY[1], z])
            b = asm2world([CARRIAGE_XY[0] + 0.25, CARRIAGE_XY[1], z])
            world_geoms.append(
                f'    <geom type="cylinder" fromto="{a[0]:.5f} {a[1]:.5f} '
                f'{a[2]:.5f}  {b[0]:.5f} {b[1]:.5f} {b[2]:.5f}" '
                f'size="{r*IN2M:.5f}" rgba="0.75 0.6 0.2 1" '
                f'contype="0" conaffinity="0"/>')

    # turn-point sites: wire enters at z-r, exits at z+r (wraps the shank)
    turn_sites = []  # per turn: list of site names in path order
    for t, (kind, idx) in enumerate(SEQ):
        first, last = t == 0, t == len(SEQ) - 1
        if kind == "f":
            z = BOLT_Z[idx]
            wrap_y = top_y[z] + 0.15  # wire wraps just above the seated bolt
            mk = lambda nm, zz, wy=wrap_y: fsite(nm, [fx, wy, zz])
        else:
            z = CARR_Z[idx]
            mk = lambda nm, zz: wsite(nm, [CARRIAGE_XY[0], CARRIAGE_XY[1], zz],
                                      "0.2 0.6 1 0.8")
        if first or last:
            nm = f"{side}_t{t}"
            mk(nm, z)
            turn_sites.append([nm])
        else:
            nm_in, nm_out = f"{side}_t{t}i", f"{side}_t{t}o"
            mk(nm_in, z - r)
            mk(nm_out, z + r)
            turn_sites.append([nm_in, nm_out])

    # per-strand tendon paths with under-arc routing
    # (strands independent: bolt-wrap capstan friction >> slip)
    strands = []
    for s in range(len(SEQ) - 1):
        frm, to = turn_sites[s], turn_sites[s + 1]
        path = [f'      <site site="{frm[-1]}"/>']
        up = SEQ[s][0] == "f"  # foot -> carriage = upward pass
        pts = arc_pts if up else arc_pts[::-1]
        z0 = (BOLT_Z if SEQ[s][0] == "f" else CARR_Z)[SEQ[s][1]]
        z1 = (BOLT_Z if SEQ[s + 1][0] == "f" else CARR_Z)[SEQ[s + 1][1]]
        for k, xy in enumerate(pts):
            frac = (k + 1) / (len(pts) + 1)
            nm = f"{side}_s{s}a{k}"
            p = asm2world([xy[0], xy[1], z0 + (z1 - z0) * frac]) - PIVOT
            foot_sites.append(f'      <site name="{nm}" pos="{p[0]:.5f} '
                              f'{p[1]:.5f} {p[2]:.5f}" size="0.0015" '
                              f'rgba="0.9 0.9 0.2 0.5"/>')
            path.append(f'      <site site="{nm}"/>')
        path.append(f'      <site site="{to[0]}"/>')
        strands.append("\n".join(path))
    return strands


def main():
    os.makedirs(MESH_DIR, exist_ok=True)
    assets, geoms = [], {"static": [], "foot": []}
    origin = {"static": np.zeros(3), "foot": PIVOT}
    for suffix, (body, rgba) in PARTS.items():
        src = os.path.join(STL_DIR, f"Initial_TestingV2 - {suffix}.STL")
        tris = asm2world(read_stl(src)) - origin[body]
        name = suffix.replace("-", "_").lower()
        write_stl(os.path.join(MESH_DIR, f"{name}.stl"), tris)
        assets.append(f'    <mesh name="{name}" file="{name}.stl"/>')
        # carriage slides vertically to its pin setting: offset the mesh in world Z
        posattr = ""
        if "height_adjust" in name:
            dz = (CARRIAGE_XY[1] - CARRIAGE_Y0) * IN2M
            posattr = f' pos="0 0 {dz:.5f}"'
        geoms[body].append(
            f'      <geom type="mesh" mesh="{name}"{posattr} rgba="{rgba}" '
            f'density="1240" contype="0" conaffinity="0"/>')

    # sampler for the real base-plate top face (drives bolt seating + wire wrap)
    global PLATE_TOP
    base_src = os.path.join(STL_DIR, "Initial_TestingV2 - Inital_Test_Base_PlateV2-1.STL")
    PLATE_TOP = make_plate_sampler(read_stl(base_src).reshape(-1, 3))

    foot_sites, world_sites, world_geoms = [], [], []
    zig = {}
    for side in ("toe", "heel"):
        zig[side] = build_side(side, foot_sites, world_sites,
                               geoms["foot"], world_geoms)

    # side pins that hold the carriage at each discrete hole; the pin at the
    # active setting is metal, the empty holes are dark. Frame-fixed (world).
    for cy in PIN_SETTINGS:
        z = cy * IN2M
        on = abs(cy - CARRIAGE_XY[1]) < 1e-6
        r = 0.0018 if on else 0.0013     # short M3-ish stub pins
        rgba = "0.85 0.86 0.9 1" if on else "0.12 0.12 0.14 1"
        for y in (-0.040, -0.126):       # front + back side pins
            world_geoms.append(
                f'    <geom type="cylinder" fromto="0.0700 {y:.5f} {z:.5f}  '
                f'0.0840 {y:.5f} {z:.5f}" size="{r:.5f}" rgba="{rgba}" '
                f'contype="0" conaffinity="0"/>')

    tendons, actuators, sensors = [], [], []
    for side in ("toe", "heel"):
        color = "0.9 0.2 0.1 0.9" if side == "toe" else "0.9 0.5 0.1 0.9"
        for s, path in enumerate(zig[side]):
            nm = f"{side}_s{s}"
            tendons.append(f'    <spatial name="w_{nm}" rgba="{color}" '
                           f'width="0.0004">\n{path}\n    </spatial>')
            actuators.append(f'    <motor name="a_{nm}" tendon="w_{nm}" '
                             f'gear="1" ctrlrange="0 10"/>')
            sensors.append(f'    <tendonpos name="len_{nm}" tendon="w_{nm}"/>')
    tendons = "\n".join(tendons)
    actuators = "\n".join(actuators)
    sensors = "\n".join(sensors)

    xml = f"""<mujoco model="v2_wire_rig">
  <compiler meshdir="meshes" angle="radian" inertiafromgeom="true" autolimits="true"/>
  <option timestep="0.001" gravity="0 0 -9.81" integrator="RK4"/>
  <visual><global offwidth="1280" offheight="960"/></visual>

  <asset>
{chr(10).join(assets)}
  </asset>

  <worldbody>
    <light pos="0.1 0.6 0.5" dir="-0.1 -0.7 -0.6" diffuse="0.9 0.9 0.9"/>
    <light pos="-0.2 0.4 -0.3" dir="0.3 -0.5 0.5" diffuse="0.4 0.4 0.4"/>

    <body name="frame">
{chr(10).join(geoms["static"])}
    </body>
{chr(10).join(world_geoms)}
{chr(10).join(world_sites)}

    <body name="foot" pos="{PIVOT[0]:.5f} {PIVOT[1]:.5f} {PIVOT[2]:.5f}">
      <joint name="ankle" type="hinge" axis="0 -1 0" range="-0.8 0.8"
             damping="0.002"/>
{chr(10).join(geoms["foot"])}
{chr(10).join(foot_sites)}
    </body>
  </worldbody>

  <tendon>
    <!-- physically one continuous wire per side; modeled as {len(SEQ) - 1}
         independent strands (bolt-wrap capstan friction blocks slip).
         MOSFET k heats its post-pair strand(s) -> per-strand actuation. -->
{tendons}
  </tendon>

  <actuator>
    <!-- ctrl = strand tension [N] (later: driven by sma_physics) -->
{actuators}
  </actuator>

  <sensor>
    <jointpos name="s_ankle" joint="ankle"/>
{sensors}
  </sensor>
</mujoco>
"""
    open(XML_OUT, "w").write(xml)
    print(f"[OK] wrote {XML_OUT}: {len(SEQ) - 1} strands/side, "
          f"M4 bolt turns, R={ARC_R*25.4:.1f}mm saddles")


if __name__ == "__main__":
    main()
