# Underwater ROV page — redesign brief

Working doc for rebuilding `underwaterrov.html` to the depth of `arc-agi-3/index.html`.
Original preserved at `underwaterrov-v1-original.html` (also in git @ `e1542e6`).

Source: `assets/imgs/cad/rov/Chase Bonfiglio Senior Project Paper (2).pdf` — 23 pages,
Senior Capstone, Ocean Lakes Math & Science Academy, December 18 2024.
Plaintext extract: `C:\portfolio-stage\rov_report.txt`.

---

## What makes the arc-agi-3 page good (the bar to hit)

Structural devices worth reusing, in order of how much they carry the page:

1. **Numbered sections** (`01`–`05`) with a persistent section-number rail. Reads like a paper, navigates like a site.
2. **Build manifest sidebar in the header** — 4 systems, each with an index, a bold name, one sentence. Tells you the scope in five seconds.
3. **Interactive canvas figures instead of static images.** The efficiency curve, the leaderboard bars, the path traces are all drawn from data.
4. **A dedicated honest-failure section** (`05 · Where the flow still breaks`). Not buried — it is the emotional climax of the page.
5. **A takeaways footer** — three bolded lessons, each with a real "so what."
6. **Committed visual identity.** CRT/retro: grain, scanlines, boot sequence, pixel font, warm phosphor palette. Consistent to the point of being a character.
7. **Honest framing everywhere.** "I've completed 0 levels so far — so my honest score is 0." Credibility comes from refusing to oversell.

**Do not clone the CRT theme.** The ROV needs its own identity — see below. Reuse the *structure and honesty*, not the skin.

---

## Visual direction for the ROV page

Proposed identity: **subsea instrumentation / dive computer.** Justified by content, not decoration.

- Palette: deep water gradient (near-black navy → teal), with sensor-readout accents in amber and cyan. Depth is the natural vertical metaphor — the page scrolls *down* into water.
- Typography: mono for all telemetry/numbers (matches Arduino serial + report tables), clean sans for prose.
- Motion: subtle caustics or particulate drift. Must respect `prefers-reduced-motion`.
- Recurring device: a **depth rail** pinned to the viewport edge that tracks scroll position, labeled in meters — the section-number equivalent.

---

## Content architecture

| # | Section | Substance |
|---|---------|-----------|
| 00 | Header | Title, one-line thesis, build manifest of the 5 subsystems, links to PDF/email |
| 01 | The problem | Chesapeake oysters; whole bay needs >1 year to filter at current population; aquaculture is pre-modern; 90 jobs from one Gulf reef restoration; $30M+ industry. Use `Oyster-Bushels-Graph.jpg` |
| 02 | Design objectives | 5 workstreams + the 3 target specs (waterproofing / data collection / data visualization) |
| 03 | The build | Frame, electronics compartment, microcontroller. `rov_wireframe.png`, `Front View 1.jpg`, `Top View (2).jpg` |
| 04 | Telemetry | The best-executed subsystem. RS-485 differential signalling and PWM |
| 05 | Sensors & sampling | CTD package, isolated compartment as failsafe, bilge-pump sampler, the relay problem |
| 06 | Waterproofing | Epoxy wells, stripping insulation so water can't wick through the conductor. `potting.jpg` |
| 07 | Results | Per-subsystem verdict with real numbers |
| 08 | **What failed and why** | Photogrammetry, pressure calibration, sample filtering. The climax section |
| 09 | Budget | $186.69 total, itemized, with the "acquired from existing resources" caveat |
| 10 | Takeaways | Three lessons, arc-style |

---

## Real numbers (all from the report — do not invent any others)

| Fact | Value |
|---|---|
| Telemetry rate | ~40 values/sec at 9600 baud |
| Protocol | RS-485 differential (A/B pair), UART-to-RS485 module required |
| Motors | 6 × bilge pump 500 GPH, BTS7960 drivers, PWM |
| Sampling pump | 1100 GPH |
| Sample container | 4in Sch40 PVC × 4in ≈ 0.22 gal |
| Pump duration | 0.72 s calculated to fill |
| Relay workaround | 2N2222 transistor — relay's stated 4.5–12V range gave insufficient current at 5V; Arduino Mega maxes at 5V |
| Electronics budget | $74.98 |
| PVC + materials budget | $111.71 |
| **Total** | **$186.69** |
| Camera | GoPro Hero 7 Silver |
| Controller | PlayStation 2 controller → Arduino Uno topside |
| Onboard MCU | Elegoo Mega (ATmega328P family) |
| Tether | Cat 6, braided cover |
| Photogrammetry software | RealityCapture |
| Frame | 1.5in Sch40 PVC, 12 tees, 10 elbows, flooding port for neutral buoyancy |

## Results — state these honestly

- **Telemetry: worked.** Full rate, no interference, PS2 controller + both sensors stable.
- **Sensor compartment: worked.** Did not leak on first dive.
- **Pressure sensor: miscalibrated.** Depth readings wrong. Report notes temperature compensation as the un-implemented fix.
- **Water sampler: ambiguous.** Container underfilled (end-cap volume unaccounted). Worse — the bilge pump was *filtering the sample in the act of collecting it*, so sample validity is unresolved pending an environmental scientist's input.
- **Photogrammetry: failed.** Explicitly "the biggest failure of the project." Worked fine on a book stack with a DSLR — detailed enough to read cover text. Failed underwater: GoPro's very wide angle plus Chesapeake turbidity left too few common reference points. Report's conclusion: viable in low-turbidity freshwater, useless here without better optics or software.

This failure section is the most valuable content on the page. A portfolio entry that says "this is why my photogrammetry didn't work, here is the DSLR control that proves the pipeline was sound, and here is the environmental variable that killed it" reads as an engineer. Do not soften it.

---

## Available media — `assets/imgs/cad/rov/`

Diagrams (small, already web-ready):
- `rs-485_waveform.png` 4.7K — differential signal
- `pulsewidthmodulation.png` 7.6K — PWM duty cycle
- `nansen bottle.webp` 9.4K — prior-art sampler
- `photogrammergyexample.png` 33K — the DSLR book-stack success
- `photogrammetry.png` 156K
- `graph.png` 106K — matplotlib live telemetry output
- `potting.jpg` 29K — epoxy well technique
- `pressuresensor.png` 194K, `temperaturesensor.png` 79K
- `controller wiring.png` 130K
- `rov_wireframe.png` 303K — CAD wireframe
- `Oyster-Bushels-Graph.jpg` 38K
- `Backupcamear.jpg` 121K

Photos (**oversized — compress during rebuild**):
- `IMG_5409.JPG` 7.7 MB, `IMG_5411 (1).JPG` 6.4 MB, `IMG_5412 (1).jpg` 5.4 MB
- `Front View 1.jpg` 927K, `Front View 2.jpg` 808K, `Top View (2).jpg` 940K

Doc: `Chase Bonfiglio Senior Project Paper (2).pdf` 8.7 MB — **link, never auto-load.** Current page pulls it on load; that alone is most of the 30.8 MB page weight.

---

## Interactive figures worth building

Ranked by payoff. Each is genuinely explanatory, not ornament.

1. **RS-485 noise demo.** Slider injects EM noise onto A and B; show both single-ended traces corrupting while the differential A−B stays clean. This is *the* reason the tether works and a static waveform image cannot convey it.
2. **PWM duty-cycle → motor speed.** Drag duty 0–255, watch the square wave and a thruster RPM readout.
3. **Live telemetry replay.** Re-create the matplotlib dashboard as a scrubbable canvas — temperature and pressure vs time, with the miscalibration visibly annotated.
4. **Photogrammetry A/B.** Book stack (worked) vs underwater (failed), with a turbidity slider showing feature-match density collapsing.
5. **Budget treemap.** $186.69 by subsystem, hover for part detail. Makes the cost story land instantly.
6. **Sampler sequence.** Small animation: pump on → check valve → 0.72 s → sealed.

---

## Hard constraints

- Page weight target **< 2 MB** on first paint. Current is 30.8 MB.
- Every image `loading="lazy"` except the hero. WebP with JPG fallback.
- Full keyboard nav; `prefers-reduced-motion` honored; alt text on every figure.
- Self-contained CSS/JS like `arc-agi-3/` — do not entangle with the theme's `johndoe.css`.
- No claim on the page that isn't in the report.

---

## DECISIONS — confirmed by Chase, 2026-08-08

### Framing: archived / shelved. This is binding.

The page opens with a **status band** stating the project is shelved. Chase's words:
*"archived, there's more that could be worked and I didn't really finish it but in all
reality I'm probably done with it"* and *"I know I talked big talk about future work in
the report that never happened."*

So the page must:
- Lead with a dated shelved status. Not buried, not euphemistic.
- **Not** reproduce the report's Personal Reflection as a roadmap. That section promises
  calibration work, an expanded sensor package, and ML-assisted photogrammetry navigation —
  none of it happened. Presenting it as "next steps" would be a false claim.
- If that ambition is mentioned at all, mention it in past tense as *what I intended at the
  time*, explicitly marked as not pursued. Retiring your own stated plans honestly is a
  stronger signal than pretending they're still live.

### Scope of testing — CRITICAL, overrides the report

**Subsystems were wet-tested. The assembled ROV never dove.**

The report's phrasing ("didn't leak on the first operation underwater", GoPro images
"captured underwater") describes *component* immersion, not a piloted run. Chase confirmed
the full vehicle never operated in open water.

Therefore the page must NOT claim, imply, or illustrate:
- a piloted dive, a mission, a survey run, or any field deployment
- navigation, station-keeping, or maneuvering performance
- any measured thruster or propulsion result

Permitted claims: sensor housing held under immersion; telemetry ran at rate on the bench;
GoPro footage was captured in water; the sampler was bench-tested.

### Interactives — approved

1. **RS-485 noise demo** — approved. Highest explanatory value.
2. **Budget treemap** — approved. $186.69 by subsystem.
3. **PWM duty-cycle figure** — approved *only as designed control scheme*.
   Chase: *"I never quite figured out the thruster response."* So the figure shows the
   duty-cycle → commanded-voltage relationship as designed and wired. It must carry a
   visible label such as "control scheme as built — thruster response never characterized."
   No RPM readout, no thrust curve, no performance numbers. Those don't exist.

Not building for now: telemetry replay dashboard, photogrammetry turbidity A/B.
Revisit once source data is confirmed.

### Code links — deferred

Arduino sketch and Python dashboard may exist locally; Chase is checking at home.
Build the page with no code section, structured so one can be added without a rework.

---

## Still open

1. Any video or photos of the ROV in water? Would anchor the hero — but only subsystem
   footage exists, so caption accordingly.
2. Photos of the *failed* underwater photogrammetry output? Would make section 08 concrete.
3. Once located: link or excerpt the Arduino/Python source.
