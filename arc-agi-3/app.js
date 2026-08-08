/* ============================================================
   REASONING CONSOLE — front-end interactions
   - RHAE score widget
   - Replay Theater: canvas frame renderer + scrubber + synced CoT/judge
   - scroll reveals + sticky nav
   ============================================================ */
(() => {
  "use strict";

  /* ---- ARC 16-color palette ---- */
  const ARC = [
    "#101019", "#1E93FF", "#F93C31", "#4FCC30", "#FFDC00", "#999999",
    "#E53AA3", "#FF851B", "#87D8F1", "#921231", "#0074D9", "#7FDBFF",
    "#B10DC9", "#3D9970", "#FF6E4A", "#4D4D4D",
  ];
  const HEX = "0123456789abcdef";
  const TAB_COLOR = { wa30: "#FFDC00", tu93: "#F93C31", re86: "#E53AA3" };

  /* =========================================================
     1. RHAE beeswarm — "you vs 340 humans"
     ========================================================= */
  const SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, cls) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (cls) n.setAttribute("class", cls);
    return n;
  }

  function initRhae2() {
    const svg = document.getElementById("rhae-svg");
    if (!svg) return;
    const envSel = document.getElementById("rhae-env");
    const lvlSel = document.getElementById("rhae-level");
    const scoreEl = document.getElementById("rhae2-score");
    const hint = document.getElementById("rhae2-hint");
    const snap = document.getElementById("rhae-snap");
    const W = 820, H = 250, padL = 54, padR = 22, padT = 20, padB = 42;
    let DATA = null, env = "wa30", lvl = "1", youA = 71, xmax = 200, drag = false;

    const lvlKeys = () => Object.keys(DATA.envs[env]).sort((a, b) => +a - +b);
    const cell = () => DATA.envs[env][lvl];
    const X = (a) => padL + (a / xmax) * (W - padL - padR);
    const Yc = (s) => padT + (1 - s / 100) * (H - padT - padB);
    const score = (a) => Math.min(cell().median / a, 1) ** 2 * 100;

    function fillEnvs() {
      const first = ["wa30", "tu93", "re86"];
      const rest = Object.keys(DATA.envs).filter(e => !first.includes(e)).sort();
      envSel.innerHTML = [...first, ...rest].map(e =>
        `<option${e === env ? " selected" : ""}>${e}</option>`).join("");
    }
    function fillLevels() {
      lvlSel.innerHTML = lvlKeys().map(l =>
        `<option${l === lvl ? " selected" : ""}>L${l}</option>`).join("");
    }

    function redraw() {
      const d = cell(), s = d.samples || [], m = d.median;
      const agentA = DATA.agent[env];               // real action count (or undefined)
      xmax = Math.max(...s, youA, m, agentA || 0) * 1.12;
      svg.innerHTML = "";
      // axes
      svg.appendChild(svgEl("line", { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB }, "rh-axis"));
      svg.appendChild(svgEl("line", { x1: padL, y1: padT, x2: padL, y2: H - padB }, "rh-axis"));
      [0, 50, 100].forEach(v => {
        const t = svgEl("text", { x: padL - 9, y: Yc(v) + 4, "text-anchor": "end" }, "rh-axlab");
        t.textContent = v; svg.appendChild(t);
      });
      [0, Math.round(m), Math.round(xmax)].forEach(a => {
        const t = svgEl("text", { x: X(a), y: H - padB + 18, "text-anchor": "middle" }, "rh-axlab");
        t.textContent = a; svg.appendChild(t);
      });
      const xl = svgEl("text", { x: (padL + W - padR) / 2, y: H - 6, "text-anchor": "middle" }, "rh-axlab");
      xl.textContent = "actions to finish the level  →  fewer is better"; svg.appendChild(xl);
      const yl = svgEl("text", { x: 14, y: padT + (H - padT - padB) / 2, "text-anchor": "middle",
        transform: `rotate(-90 14 ${padT + (H - padT - padB) / 2})` }, "rh-axlab");
      yl.textContent = "RHAE score"; svg.appendChild(yl);
      // efficiency curve
      const pts = [];
      for (let a = 1; a <= xmax; a += xmax / 140) pts.push(`${X(a).toFixed(1)},${Yc(score(a)).toFixed(1)}`);
      svg.appendChild(svgEl("polyline", { points: pts.join(" ") }, "rh-curve"));
      // human median line
      svg.appendChild(svgEl("line", { x1: X(m), y1: padT, x2: X(m), y2: H - padB }, "rh-median"));
      const mt = svgEl("text", { x: X(m), y: padT - 5, "text-anchor": "middle", fill: "#E53AA3" }, "rh-lab");
      mt.textContent = "human median"; svg.appendChild(mt);
      // human dots along the bottom band
      const base = H - padB - 8, span = 40;
      s.forEach((a, i) => {
        const j = ((i * 37) % 13) / 13;
        svg.appendChild(svgEl("circle", { cx: X(a), cy: base - span * j, r: 4 }, "rh-dot"));
      });
      // agent's REAL run: a tick on the axis + honest "unfinished -> 0"
      if (agentA && agentA <= xmax) {
        svg.appendChild(svgEl("line", { x1: X(agentA), y1: H - padB - 30, x2: X(agentA), y2: H - padB + 4 }, "rh-agentline"));
        const at = svgEl("text", { x: X(agentA), y: H - padB - 34, "text-anchor": "middle", fill: "#F93C31" }, "rh-lab");
        at.textContent = "my agent — level unfinished"; svg.appendChild(at);
      }
      // draggable "you" marker on the curve (hypothetical: IF you finished in youA actions)
      svg.appendChild(svgEl("line", { x1: X(youA), y1: Yc(score(youA)), x2: X(youA), y2: H - padB }, "rh-youline"));
      const you = svgEl("circle", { cx: X(youA), cy: Yc(score(youA)), r: 6 }, "rh-you");
      svg.appendChild(you);
      const yt = svgEl("text", { x: X(youA), y: Yc(score(youA)) - 12, "text-anchor": "middle", fill: "#87D8F1" }, "rh-lab");
      yt.textContent = "you"; svg.appendChild(yt);

      const sc = score(youA);
      scoreEl.textContent = (sc < 10 ? sc.toFixed(1) : Math.round(sc)) + " / 100";
      hint.textContent = `if you finish in ${Math.round(youA)} actions. My agent reached ${agentA || "?"} actions without completing → its real RHAE here is 0.`;
    }

    function actFromEvent(ev) {
      const r = svg.getBoundingClientRect();
      const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
      const x = cx / r.width * W;
      return Math.max(1, Math.min(xmax, (x - padL) / (W - padL - padR) * xmax));
    }
    svg.addEventListener("pointerdown", e => { drag = true; youA = actFromEvent(e); redraw(); });
    window.addEventListener("pointermove", e => { if (drag) { youA = actFromEvent(e); redraw(); } });
    window.addEventListener("pointerup", () => { drag = false; });

    envSel.addEventListener("change", () => {
      env = envSel.value;
      if (!DATA.envs[env][lvl]) lvl = lvlKeys()[0];
      fillLevels(); youA = cell().median; redraw();
    });
    lvlSel.addEventListener("change", () => { lvl = lvlSel.value.replace("L", ""); youA = cell().median; redraw(); });
    snap.addEventListener("click", () => { youA = DATA.agent[env] || cell().median * 2; redraw(); });

    fetch("data/rhae.json").then(r => r.json()).then(j => {
      DATA = j; fillEnvs(); fillLevels(); youA = cell().median; redraw();
    }).catch(e => { console.error(e); });
  }

  /* =========================================================
     1b. Game gallery
     ========================================================= */
  function frameColor(idx) { return ARC[idx] || "#000"; }
  function drawFrameTo(canvas, fr, g) {
    const ctx = canvas.getContext("2d"), W = canvas.width, cell = W / g;
    for (let r = 0; r < g; r++)
      for (let c = 0; c < g; c++) {
        ctx.fillStyle = frameColor(fr[r * g + c]);
        ctx.fillRect(c * cell, r * cell, Math.ceil(cell), Math.ceil(cell));
      }
  }
  async function initGallery() {
    const root = document.getElementById("gallery");
    if (!root) return;
    const REPLAY = { wa30: "#FFDC00", tu93: "#F93C31", re86: "#E53AA3" };
    try {
      const g = await (await fetch("data/gallery.json")).json();
      const track = document.createElement("div");
      track.className = "gallery__track";
      const makeTile = (e) => {
        const isR = !!REPLAY[e.env];
        const a = document.createElement("a");
        a.className = "gtile" + (isR ? " gtile--replay" : "");
        a.href = isR ? "#theater" : "https://arcprize.org/tasks/" + e.env;
        if (!isR) { a.target = "_blank"; a.rel = "noopener"; }
        else a.style.setProperty("--gc", REPLAY[e.env]);
        const cv = document.createElement("canvas");
        cv.width = 64; cv.height = 64;
        drawFrameTo(cv, decodeFrame(e.frame), 64);
        a.appendChild(cv);
        const lab = document.createElement("div");
        lab.className = "gtile__lab";
        lab.innerHTML = `<span>${e.env}</span><span class="lv">${e.win_levels || "?"}L</span>`;
        a.appendChild(lab);
        if (isR) a.addEventListener("click", () => {
          const t = [...document.querySelectorAll(".tab")].find(x => x.textContent.includes(e.env));
          if (t) setTimeout(() => t.click(), 400);
        });
        return a;
      };
      // duplicate the set once so the marquee loops seamlessly at -50%
      g.envs.forEach(e => track.appendChild(makeTile(e)));
      g.envs.forEach(e => { const t = makeTile(e); t.setAttribute("aria-hidden", "true"); t.tabIndex = -1; track.appendChild(t); });
      root.appendChild(track);
    } catch (err) {
      root.innerHTML = `<p class="foot">Gallery data missing — run <code>py -3.14 portfolio/build_gallery.py</code>.</p>`;
      console.error(err);
    }
  }

  /* =========================================================
     2. Replay Theater
     ========================================================= */
  const ACTION_LABEL = {
    1: "BTN 1", 2: "BTN 2", 3: "BTN 3", 4: "BTN 4", 5: "BTN 5",
    6: "CLICK", 7: "ACT 7",
  };

  function decodeFrame(str) {
    // 4096-char hex string -> Uint8Array(4096)
    const a = new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) a[i] = HEX.indexOf(str[i]);
    return a;
  }

  class Theater {
    constructor(root, episodes) {
      this.root = root;
      this.episodes = episodes; // manifest entries
      this.cache = {};          // env -> loaded json
      this.cur = null;          // current episode data
      this.i = 0;               // current step index
      this.playing = false;
      this.timer = null;
      this.overlay = false;
      this.grid = 64;

      this.canvas = document.getElementById("board");
      this.ctx = this.canvas.getContext("2d");
      this.scrub = document.getElementById("scrub");

      this.el = {
        env: document.getElementById("hud-env"),
        step: document.getElementById("hud-step"),
        action: document.getElementById("hud-action"),
        verdict: document.getElementById("hud-verdict"),
        goal: document.getElementById("mind-goal"),
        cot: document.getElementById("mind-cot"),
        judge: document.getElementById("mind-judge"),
        marker: document.getElementById("mind-marker"),
        caption: document.getElementById("episode-caption"),
        chRail: document.getElementById("chapter-rail"),
        chIx: document.getElementById("chapter-ix"),
        chTitle: document.getElementById("chapter-title"),
        chNote: document.getElementById("chapter-note"),
        chCount: document.getElementById("chapter-count"),
      };
      this.chapters = {};
      this.chaps = [];
      this.curChap = 0;
      this.curEnv = this.episodes[0].env;

      this.buildTabs();
      this.wireTransport();
      this.wireGuide();
      fetch("data/chapters.json").then(r => r.json())
        .then(c => { this.chapters = c; })
        .catch(() => { })
        .finally(() => this.load(this.episodes[0].env));
    }

    buildTabs() {
      const tabs = document.getElementById("episode-tabs");
      this.episodes.forEach((ep, k) => {
        const b = document.createElement("button");
        b.className = "tab" + (k === 0 ? " active" : "");
        b.setAttribute("role", "tab");
        b.style.setProperty("--tab-c", TAB_COLOR[ep.env] || "#87D8F1");
        b.innerHTML = `<span class="tab__env">${ep.env}</span>` +
          `<span class="tab__role">${ep.role.replace(/-/g, " ")}</span>`;
        b.dataset.env = ep.env;
        b.addEventListener("click", () => this.load(ep.env));
        tabs.appendChild(b);
      });
    }

    setActiveTab(env) {
      document.querySelectorAll(".tab").forEach(t =>
        t.classList.toggle("active", t.dataset.env === env));
    }

    wireGuide() {
      document.getElementById("ch-prev").addEventListener("click", () => this.gotoChapter(this.curChap - 1));
      document.getElementById("ch-next").addEventListener("click", () => this.gotoChapter(this.curChap + 1));
      document.getElementById("ep-prev").addEventListener("click", () => this.switchEpisode(-1));
      document.getElementById("ep-next").addEventListener("click", () => this.switchEpisode(1));
    }

    switchEpisode(dir) {
      const order = this.episodes.map(e => e.env);
      const idx = (order.indexOf(this.curEnv) + dir + order.length) % order.length;
      this.load(order[idx]);
    }

    buildRail() {
      const rail = this.el.chRail;
      rail.innerHTML = "";
      this.chaps.forEach((c, k) => {
        const d = document.createElement("button");
        d.className = "chdot";
        d.setAttribute("role", "tab");
        d.title = c.title;
        d.innerHTML = `<i></i><span>${c.title}</span>`;
        d.addEventListener("click", () => this.gotoChapter(k));
        rail.appendChild(d);
      });
    }

    gotoChapter(idx) {
      if (!this.chaps.length) return;
      this.curChap = Math.max(0, Math.min(this.chaps.length - 1, idx));
      const c = this.chaps[this.curChap];
      this.pause();
      this.seek(c.i);
      this.el.chIx.textContent = String(this.curChap + 1).padStart(2, "0");
      this.el.chTitle.textContent = c.title;
      this.el.chNote.textContent = c.note;
      this.el.chCount.textContent = `${this.curChap + 1} / ${this.chaps.length}`;
      [...this.el.chRail.children].forEach((d, k) =>
        d.classList.toggle("active", k === this.curChap));
    }

    wireTransport() {
      document.getElementById("btn-play").addEventListener("click", () => this.toggle());
      document.getElementById("btn-fwd").addEventListener("click", () => { this.pause(); this.seek(this.i + 1); });
      document.getElementById("btn-back").addEventListener("click", () => { this.pause(); this.seek(this.i - 1); });
      this.scrub.addEventListener("input", () => { this.pause(); this.seek(+this.scrub.value); });
      document.getElementById("toggle-overlay").addEventListener("change", (e) => {
        this.overlay = e.target.checked; this.draw();
      });
    }

    tune() {
      const crt = document.getElementById("crt");
      if (!crt || REDUCE) return;
      crt.classList.add("tuning");
      clearTimeout(this._tuneT);
      this._tuneT = setTimeout(() => crt.classList.remove("tuning"), 440);
    }

    async load(env) {
      this.pause();
      this.tune();
      let data = this.cache[env];
      if (!data) {
        const ep = this.episodes.find(e => e.env === env);
        const res = await fetch(ep.file);
        data = await res.json();
        this.cache[env] = data;
      }
      this.cur = data;
      this.grid = data.meta.grid || 64;
      this.scrub.max = data.steps.length - 1;
      this.el.caption.innerHTML = data.meta.caption +
        ` <b>(levels solved: ${data.meta.levels_completed})</b>`;
      // precompute the "carried" goal / cot per step so a scrub always shows the
      // most recent reasoning even on steps that logged none.
      this.fillForward(data.steps);
      this.curEnv = env;
      this.setActiveTab(env);
      this.chaps = (this.chapters && this.chapters[env]) || [];
      this.buildRail();
      if (this.chaps.length) this.gotoChapter(0);
      else { this.el.chNote.textContent = "Scrub the timeline to explore this episode."; this.seek(0); }
    }

    fillForward(steps) {
      let goal = null, judge = null;
      for (const s of steps) {
        if (s.goal) goal = s.goal; else s._goal = goal;
        if (s.goal) s._goal = s.goal;
        if (s.judge) judge = s.judge; else s._judge = judge;
        if (s.judge) s._judge = s.judge;
      }
    }

    seek(i) {
      if (!this.cur) return;
      const n = this.cur.steps.length;
      this.i = Math.max(0, Math.min(n - 1, i));
      this.scrub.value = this.i;
      this.draw();
      this.renderMind();
    }

    draw() {
      if (!this.cur) return;
      const g = this.grid, ctx = this.ctx, W = this.canvas.width, cell = W / g;
      const fr = decodeFrame(this.cur.frames[this.i]);
      for (let r = 0; r < g; r++) {
        for (let c = 0; c < g; c++) {
          ctx.fillStyle = frameColor(fr[r * g + c]);
          ctx.fillRect(c * cell, r * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
      if (this.overlay) this.drawOverlay(fr, cell, g);
      // HUD
      const st = this.cur.steps[this.i];
      this.el.env.textContent = this.cur.meta.env.toUpperCase();
      this.el.step.textContent = `STEP ${st.step ?? this.i} / ${n_(this.cur)}`;
      this.el.action.textContent = st.action != null
        ? (ACTION_LABEL[st.action] || ("ACT " + st.action)) : "—";
      const jv = (st._judge && st.judge) ? st.judge.verdict : null;
      const v = this.el.verdict;
      if (st.judge) {
        v.textContent = st.judge.verdict + (st.judge.conf != null ? ` ${st.judge.conf}` : "");
        v.className = "board__verdict show v-" + st.judge.verdict;
      } else {
        v.className = "board__verdict";
      }
    }

    /* faint grid + change-cells vs previous frame = the "facts" the loop reads */
    drawOverlay(fr, cell, g) {
      const ctx = this.ctx;
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let k = 0; k <= g; k += 2) {
        ctx.beginPath(); ctx.moveTo(k * cell, 0); ctx.lineTo(k * cell, g * cell); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, k * cell); ctx.lineTo(g * cell, k * cell); ctx.stroke();
      }
      if (this.i > 0) {
        const prev = decodeFrame(this.cur.frames[this.i - 1]);
        ctx.strokeStyle = "#FFDC00";
        ctx.lineWidth = 2;
        for (let r = 0; r < g; r++) {
          for (let c = 0; c < g; c++) {
            if (fr[r * g + c] !== prev[r * g + c]) {
              ctx.strokeRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
            }
          }
        }
      }
    }

    renderMind() {
      const st = this.cur.steps[this.i];
      this.el.goal.textContent = st._goal || st.goal || "— (no goal formed yet)";

      // CoT: prefer this step's; else show the most recent non-empty upstream
      let cot = st.cot && st.cot.length ? st.cot : null;
      let carriedFrom = null;
      if (!cot) {
        for (let k = this.i - 1; k >= 0 && k > this.i - 12; k--) {
          const s = this.cur.steps[k];
          if (s.cot && s.cot.length) { cot = s.cot; carriedFrom = s.step ?? k; break; }
        }
      }
      const cls = { "perceive": "perceive", "abduct goal": "abduct", "plan / act": "plan", "control": "control" };
      if (cot) {
        this.el.cot.innerHTML = cot.map(c =>
          `<div class="cot cot--${cls[c.stage] || "plan"}">` +
          `<b class="cot__stage">${c.stage}${carriedFrom ? ` · from step ${carriedFrom}` : ""}</b>` +
          `${escapeHtml(c.text)}</div>`
        ).join("");
      } else {
        this.el.cot.innerHTML = `<p class="empty">no verbal reasoning logged near this step — the loop is executing a committed plan.</p>`;
      }

      const j = st.judge || st._judge;
      if (j) {
        this.el.judge.textContent = `[${j.verdict}${j.conf != null ? " " + j.conf : ""}] ${j.why || ""}`;
      } else {
        this.el.judge.textContent = "— awaiting first verdict";
      }

      this.el.marker.innerHTML = (st.markers || []).map(m => `<span>${escapeHtml(m)}</span>`).join("");
    }

    toggle() { this.playing ? this.pause() : this.play(); }
    play() {
      if (!this.cur) return;
      if (this.i >= this.cur.steps.length - 1) this.seek(0);
      this.playing = true;
      document.getElementById("btn-play").textContent = "⏸";
      const tick = () => {
        if (!this.playing) return;
        if (this.i >= this.cur.steps.length - 1) { this.pause(); return; }
        this.seek(this.i + 1);
        this.timer = setTimeout(tick, 380);
      };
      this.timer = setTimeout(tick, 380);
    }
    pause() {
      this.playing = false;
      clearTimeout(this.timer);
      const b = document.getElementById("btn-play");
      if (b) b.textContent = "▶";
    }
  }

  const n_ = (d) => d.steps[d.steps.length - 1].step ?? d.steps.length;
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

  async function initTheater() {
    const root = document.getElementById("theater-app");
    if (!root) return;
    try {
      const man = await (await fetch("data/manifest.json")).json();
      new Theater(root, man.episodes);
    } catch (e) {
      root.innerHTML = `<p class="foot" style="padding:24px">Replay data failed to load. ` +
        `Run <code>py -3.14 portfolio/build_portfolio_data.py</code> and serve over HTTP ` +
        `(not file://).</p>`;
      console.error(e);
    }
  }

  /* =========================================================
     1c. Failure-shape path traces
     ========================================================= */
  const VCOL = { TOWARD: "#4FCC30", AWAY: "#F93C31", NONE: "#8892b8" };
  const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function paintPath(cv, e, upto) {
    const ctx = cv.getContext("2d"), g = e.grid || 64, W = cv.width, cell = W / g;
    const P = e.path;
    ctx.clearRect(0, 0, W, W);
    // faint context frame for orientation
    const fr = decodeFrame(e.context_frame);
    ctx.globalAlpha = 0.15;
    for (let r = 0; r < g; r++)
      for (let c = 0; c < g; c++) {
        ctx.fillStyle = frameColor(fr[r * g + c]);
        ctx.fillRect(c * cell, r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    ctx.globalAlpha = 1;
    if (!P || !P.length) return;
    const px = (p) => p.c * cell + cell / 2, py = (p) => p.r * cell + cell / 2;
    const n = Math.max(1, Math.min(P.length - 1, upto));
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.4;
    for (let i = 1; i <= n; i++) {
      ctx.strokeStyle = VCOL[P[i].v] || "#8892b8";
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(px(P[i - 1]), py(P[i - 1]));
      ctx.lineTo(px(P[i]), py(P[i]));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // start dot
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(px(P[0]), py(P[0]), 4.5, 0, 7); ctx.fill();
    const done = n >= P.length - 1;
    if (!done) {
      // glowing moving head
      const h = P[n];
      ctx.save();
      ctx.shadowColor = "#fff"; ctx.shadowBlur = 10;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(px(h), py(h), 3.5, 0, 7); ctx.fill();
      ctx.restore();
    } else {
      // end diamond
      const last = P[P.length - 1];
      ctx.save();
      ctx.translate(px(last), py(last)); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#FFDC00"; ctx.fillRect(-4.5, -4.5, 9, 9);
      ctx.restore();
    }
  }
  function animatePath(cv, e) {
    const total = (e.path || []).length;
    if (REDUCE || total < 3) { paintPath(cv, e, total); return; }
    const dur = 1500 + total * 6;
    let start = null;
    const step = (ts) => {
      if (start === null) start = ts;
      const k = Math.min(1, (ts - start) / dur);
      // ease-out so the trail decelerates into its final shape
      const e2 = 1 - Math.pow(1 - k, 2.2);
      paintPath(cv, e, Math.floor(e2 * (total - 1)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  async function initPaths() {
    const canvases = [...document.querySelectorAll("canvas.trace")];
    if (!canvases.length) return;
    try {
      const data = await (await fetch("data/paths.json")).json();
      const byEnv = {};
      data.envs.forEach(e => { byEnv[e.env] = e; });
      // draw the faint underlay immediately; animate the trail on scroll-in
      canvases.forEach(cv => { const e = byEnv[cv.dataset.env]; if (e) paintPath(cv, e, 1); });
      const io = new IntersectionObserver((ents) => {
        ents.forEach(en => {
          if (en.isIntersecting) {
            const e = byEnv[en.target.dataset.env];
            if (e) animatePath(en.target, e);
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.4 });
      canvases.forEach(cv => io.observe(cv));
    } catch (err) { console.error(err); }
  }

  /* =========================================================
     3. scroll reveals + sticky nav
     ========================================================= */
  function initScroll() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".sec, .card, .stage, .wall__row, .rigor__item").forEach(el => {
      el.classList.add("reveal"); io.observe(el);
    });

    document.querySelectorAll("[data-wip]").forEach(a =>
      a.addEventListener("click", e => { e.preventDefault(); a.blur(); }));
  }

  /* =========================================================
     4. power-on boot / POST + easter egg
     ========================================================= */
  function initBoot() {
    const boot = document.getElementById("boot");
    if (!boot) return;
    const post = document.getElementById("boot-post");
    const finish = () => {
      boot.classList.add("off");
      setTimeout(() => boot.classList.add("gone"), 520);
      try { localStorage.setItem("arc_booted", "1"); } catch (e) { /* private mode */ }
    };
    document.getElementById("boot-skip").addEventListener("click", finish);
    let seen = false;
    try { seen = !!localStorage.getItem("arc_booted"); } catch (e) { /* ignore */ }
    if (REDUCE || seen) { boot.classList.add("gone"); return; }

    const lines = [
      "ARCTRON-64    ARC-AGI-3 RESEARCH CONSOLE",
      "MEM ...................... <b>OK</b>",
      "LOADING 25 ENVIRONMENTS .. <b>OK</b>",
      "HUMAN REPLAY GAUGE (340) . <b>OK</b>",
      "REASONING LOOP ........... <b>ONLINE</b>",
      "QWEN3-VL-32B OFFLINE ..... <b>READY</b>",
      "",
      "<span class='warn'>▸ games solved: 0 — work in progress</span>",
    ];
    let i = 0;
    const type = () => {
      if (i < lines.length) {
        post.innerHTML += lines[i] + "\n";
        i++;
        setTimeout(type, i <= 1 ? 520 : 175);
      } else {
        setTimeout(finish, 720);
      }
    };
    setTimeout(type, 800);
  }

  function initEasterEgg() {
    const seq = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
    let k = 0;
    window.addEventListener("keydown", (e) => {
      k = (e.keyCode === seq[k]) ? k + 1 : (e.keyCode === seq[0] ? 1 : 0);
      if (k === seq.length) {
        document.body.classList.toggle("phosphor");
        k = 0;
      }
    });
  }

  /* =========================================================
     5. "what is ARC" infer-strip + scoring efficiency curve
     ========================================================= */
  // "act -> observe -> infer" strip, built from REAL ARC-AGI-3 frames (two
  // moments of an actual episode), so it shows the actual game, not a
  // synthetic ARC-puzzle grid.
  async function initAbout() {
    const cA = document.querySelector('.infgrid[data-panel="a"]');
    const cB = document.querySelector('.infgrid[data-panel="b"]');
    const cC = document.querySelector('.infgrid[data-panel="c"]');
    if (!cA) return;
    try {
      const d = await (await fetch("data/replay_wa30.json")).json();
      const n = d.frames.length;
      const iA = Math.min(2, n - 1), iB = Math.min(16, n - 1);
      drawFrameTo(cA, decodeFrame(d.frames[iA]), 64);
      drawFrameTo(cB, decodeFrame(d.frames[iB]), 64);
      drawFrameTo(cC, decodeFrame(d.frames[iB]), 64);
      const ctx = cC.getContext("2d"), W = cC.width;
      ctx.fillStyle = "rgba(5,7,15,.6)"; ctx.fillRect(0, 0, W, W);
      ctx.fillStyle = ARC[6]; ctx.font = "bold " + Math.round(W * 0.5) + "px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("?", W / 2, W / 2 + 2);
    } catch (e) { console.error(e); }
  }

  function initCurve() {
    const cv = document.getElementById("curve");
    if (!cv) return;
    const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
    const padL = 46, padR = 20, padT = 22, padB = 46;
    const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT, XMAX = 3;
    const X = (a) => x0 + (a / XMAX) * (x1 - x0);
    const Y = (s) => y0 - (s / 100) * (y0 - y1);
    const score = (a) => Math.min(1 / a, 1) ** 2 * 100; // a in units of human actions
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#1d2751"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
    ctx.fillStyle = "#606ea0"; ctx.font = "11px monospace";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    [0, 50, 100].forEach(s => ctx.fillText(s, x0 - 8, Y(s)));
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("human's pace", X(1), y0 + 8);
    ctx.fillText("more actions →", X(2.4), y0 + 8);
    ctx.save(); ctx.translate(13, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("RHAE score", 0, 0); ctx.restore();
    // efficiency curve (plateau at 100 until human's pace, squared decay after)
    ctx.strokeStyle = "#87D8F1"; ctx.lineWidth = 2.5; ctx.beginPath();
    let first = true;
    for (let a = 0.5; a <= XMAX; a += 0.02) {
      const px = X(a), py = Y(score(a));
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // human-median marker
    ctx.strokeStyle = "#4FCC30"; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(X(1), y1); ctx.lineTo(X(1), y0); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#4FCC30"; ctx.beginPath(); ctx.arc(X(1), Y(100), 5, 0, 7); ctx.fill();
    ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.font = "11px monospace";
    ctx.fillText("human = 100", X(1) + 8, y1);
    // honest zero pin
    ctx.fillStyle = "#F93C31";
    ctx.beginPath(); ctx.arc(x0 + 15, y0 - 3, 6, 0, 7); ctx.fill();
    ctx.textBaseline = "bottom"; ctx.font = "bold 11px monospace";
    ctx.fillText("this project — 0 completed → 0", x0 + 27, y0 - 1);
  }

  /* ---- boot ---- */
  document.addEventListener("DOMContentLoaded", () => {
    initBoot();
    initAbout();
    initCurve();
    initGallery();
    initPaths();
    initTheater();
    initScroll();
    initEasterEgg();
  });
})();
