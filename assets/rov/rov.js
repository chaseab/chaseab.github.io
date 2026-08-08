/* ============================================================
   Underwater ROV — page instruments
   1. depth rail + light attenuation
   2. marine snow
   3. RS-485 differential noise demo
   4. PWM duty-cycle figure (commanded voltage only — see caveat)
   5. budget treemap
   6. scroll reveal
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MAX_DEPTH = 60; // metres of "scroll depth" — a navigation metaphor, not a rating

  /* ---------- 1. depth rail ---------- */
  var rail = document.getElementById('rail-ticks');
  var marker = document.getElementById('rail-marker');
  var readout = document.getElementById('rail-depth');

  if (rail) {
    for (var m = 0; m <= MAX_DEPTH; m += 5) {
      var t = document.createElement('div');
      var major = m % 20 === 0;
      t.className = 'rail__tick' + (major ? ' rail__tick--major' : '');
      t.style.top = (m / MAX_DEPTH) * 100 + '%';
      if (major) t.innerHTML = '<span>' + m + 'm</span>';
      rail.appendChild(t);
    }
  }

  var ticking = false;
  function onScroll() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    var p = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;

    doc.style.setProperty('--depth', p.toFixed(4));

    if (marker) marker.style.top = (p * 100) + '%';
    if (readout) {
      readout.style.top = (p * 100) + '%';
      readout.textContent = (p * MAX_DEPTH).toFixed(1) + 'm';
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- 2. marine snow ---------- */
  var snow = document.getElementById('snow');
  if (snow && !reduce) {
    var sx = snow.getContext('2d');
    var flakes = [];
    function sizeSnow() {
      snow.width = window.innerWidth;
      snow.height = window.innerHeight;
    }
    sizeSnow();
    window.addEventListener('resize', sizeSnow);
    for (var i = 0; i < 70; i++) {
      flakes.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.5 + 0.35,
        v: Math.random() * 0.22 + 0.05,
        d: Math.random() * Math.PI * 2,
        o: Math.random() * 0.35 + 0.08
      });
    }
    (function snowLoop() {
      sx.clearRect(0, 0, snow.width, snow.height);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.y += f.v;
        f.d += 0.004;
        f.x += Math.sin(f.d) * 0.16;
        if (f.y > snow.height + 4) { f.y = -4; f.x = Math.random() * snow.width; }
        sx.beginPath();
        sx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        sx.fillStyle = 'rgba(190,225,235,' + f.o + ')';
        sx.fill();
      }
      requestAnimationFrame(snowLoop);
    })();
  }

  /* ---------- helpers ---------- */
  function fitCanvas(cv, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || cv.parentNode.clientWidth;
    cv.width = w * dpr;
    cv.height = cssH * dpr;
    cv.style.height = cssH + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: cssH };
  }

  function paintRange(el) {
    var pct = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.background =
      'linear-gradient(90deg, var(--cyan) ' + pct + '%, var(--line) ' + pct + '%)';
  }

  /* ---------- 3. RS-485 differential demo ---------- */
  var rsCanvas = document.getElementById('rs485');
  if (rsCanvas) {
    var BITS = [1, 0, 1, 1, 0, 0, 1, 0];
    var VHI = 5, THRESH = 2.5;
    var noiseEl = document.getElementById('rs-noise');
    var noiseOut = document.getElementById('rs-noise-out');
    var verdictSE = document.getElementById('rs-verdict-se');
    var verdictDF = document.getElementById('rs-verdict-df');

    // fixed noise shape so the figure is stable and comparable as you drag
    var seed = [];
    for (var s = 0; s < 400; s++) {
      seed.push(Math.sin(s * 0.21) * 0.55 + Math.sin(s * 0.86 + 1.3) * 0.32 +
                Math.sin(s * 2.4 + 0.7) * 0.13);
    }

    function drawRS() {
      var amp = parseFloat(noiseEl.value);            // volts of common-mode noise
      var f = fitCanvas(rsCanvas, 300);
      var ctx = f.ctx, W = f.w, H = f.h;
      ctx.clearRect(0, 0, W, H);

      var padL = 42, padR = 12;
      var plotW = W - padL - padR;
      var laneH = 110, gap = 26;
      var topA = 16, topD = topA + laneH + gap;
      var n = seed.length;

      function bitAt(i) { return BITS[Math.floor(i / n * BITS.length)]; }
      function noiseAt(i) { return seed[i] * amp; }
      function xAt(i) { return padL + (i / (n - 1)) * plotW; }

      // lane frames + labels
      function lane(top, label, sub) {
        ctx.strokeStyle = 'rgba(29,59,79,.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(padL, top, plotW, laneH);
        ctx.fillStyle = '#8ba7b4';
        ctx.font = '600 9px JetBrains Mono, monospace';
        ctx.fillText(label, padL + 6, top + 13);
        if (sub) {
          ctx.fillStyle = '#5d7d8c';
          ctx.fillText(sub, padL + 6, top + 25);
        }
      }
      lane(topA, 'SINGLE-ENDED (what UART reads)', 'A and B measured against ground');
      lane(topD, 'DIFFERENTIAL  A − B (what RS-485 reads)', 'noise is common to both — it cancels');

      // ---- lane 1: A and B vs ground, with threshold ----
      var yA = function (v) { return topA + laneH - 14 - (v + 3) / 11 * (laneH - 28); };
      // threshold line
      ctx.strokeStyle = 'rgba(242,181,68,.55)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padL, yA(THRESH)); ctx.lineTo(padL + plotW, yA(THRESH)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(242,181,68,.8)';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillText('2.5V threshold', padL + plotW - 82, yA(THRESH) - 4);

      function trace(getV, y, color, width) {
        ctx.beginPath();
        for (var i = 0; i < n; i++) {
          var px = xAt(i), py = y(getV(i));
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      }
      var aV = function (i) { return (bitAt(i) ? VHI : 0) + noiseAt(i); };
      var bV = function (i) { return (bitAt(i) ? 0 : VHI) + noiseAt(i); };
      trace(bV, yA, 'rgba(139,167,180,.75)', 1.2);
      trace(aV, yA, '#4fd1e0', 1.6);

      // ---- lane 2: differential ----
      var yD = function (v) { return topD + laneH - 14 - (v + 7) / 14 * (laneH - 28); };
      ctx.strokeStyle = 'rgba(242,181,68,.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padL, yD(0)); ctx.lineTo(padL + plotW, yD(0)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(242,181,68,.65)';
      ctx.fillText('0V', padL + plotW - 20, yD(0) - 4);
      trace(function (i) { return aV(i) - bV(i); }, yD, '#3fc9a3', 1.7);

      // ---- decode both, mark bit errors ----
      var errSE = 0;
      var perBit = Math.floor(n / BITS.length);
      for (var b = 0; b < BITS.length; b++) {
        var mid = b * perBit + Math.floor(perBit / 2);
        var seBit = aV(mid) > THRESH ? 1 : 0;
        if (seBit !== BITS[b]) errSE++;
        // sample ticks on lane 1
        var bad = seBit !== BITS[b];
        ctx.fillStyle = bad ? '#ef6a52' : 'rgba(79,209,224,.55)';
        ctx.beginPath();
        ctx.arc(xAt(mid), yA(aV(mid)), bad ? 3.4 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // y axis labels
      ctx.fillStyle = '#5d7d8c';
      ctx.font = '8px JetBrains Mono, monospace';
      [5, 0].forEach(function (v) { ctx.fillText(v + 'V', 8, yA(v) + 3); });
      [5, -5].forEach(function (v) {
        ctx.fillText((v > 0 ? '+' : '') + v + 'V', 6, yD(v) + 3);
      });

      noiseOut.textContent = amp.toFixed(1) + ' V';
      if (errSE > 0) {
        verdictSE.textContent = errSE + ' of 8 bits corrupted';
        verdictSE.className = 'v-fail';
      } else {
        verdictSE.textContent = 'all 8 bits intact';
        verdictSE.className = 'v-ok';
      }
      verdictDF.textContent = 'all 8 bits intact';
      verdictDF.className = 'v-ok';
    }

    noiseEl.addEventListener('input', function () { paintRange(noiseEl); drawRS(); });
    paintRange(noiseEl);
    window.addEventListener('resize', drawRS);
    drawRS();
  }

  /* ---------- 4. PWM duty-cycle figure ---------- */
  var pwmCanvas = document.getElementById('pwm');
  if (pwmCanvas) {
    var dutyEl = document.getElementById('pwm-duty');
    var dutyOut = document.getElementById('pwm-duty-out');
    var pctOut = document.getElementById('pwm-pct');
    var voltOut = document.getElementById('pwm-volt');
    var VBAT = 12; // 12V battery, per the report

    function drawPWM() {
      var duty = parseInt(dutyEl.value, 10);
      var frac = duty / 255;
      var f = fitCanvas(pwmCanvas, 190);
      var ctx = f.ctx, W = f.w, H = f.h;
      ctx.clearRect(0, 0, W, H);

      var padL = 40, padR = 14, padT = 18, padB = 26;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var cycles = 4, cw = plotW / cycles;
      var yHi = padT + 8, yLo = padT + plotH - 8;

      ctx.strokeStyle = 'rgba(29,59,79,.9)';
      ctx.strokeRect(padL, padT, plotW, plotH);

      // mean (commanded average) line
      var yMean = yLo - frac * (yLo - yHi);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(242,181,68,.75)';
      ctx.beginPath(); ctx.moveTo(padL, yMean); ctx.lineTo(padL + plotW, yMean); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(242,181,68,.9)';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillText('mean ' + (frac * VBAT).toFixed(1) + 'V', padL + plotW - 62, yMean - 5);

      // square wave
      ctx.beginPath();
      ctx.moveTo(padL, yLo);
      for (var c = 0; c < cycles; c++) {
        var x0 = padL + c * cw, xHiEnd = x0 + cw * frac, xEnd = x0 + cw;
        ctx.lineTo(x0, yHi); ctx.lineTo(xHiEnd, yHi);
        ctx.lineTo(xHiEnd, yLo); ctx.lineTo(xEnd, yLo);
      }
      ctx.strokeStyle = '#4fd1e0'; ctx.lineWidth = 2; ctx.stroke();

      // duty shading
      ctx.fillStyle = 'rgba(79,209,224,.1)';
      for (var c2 = 0; c2 < cycles; c2++) {
        var xa = padL + c2 * cw;
        ctx.fillRect(xa, yHi, cw * frac, yLo - yHi);
      }

      ctx.fillStyle = '#5d7d8c';
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillText('12V', 8, yHi + 3);
      ctx.fillText('0V', 12, yLo + 3);
      ctx.fillText('4 PWM cycles', padL, H - 8);

      dutyOut.textContent = duty;
      pctOut.textContent = Math.round(frac * 100) + '%';
      voltOut.textContent = (frac * VBAT).toFixed(1) + ' V';
    }
    dutyEl.addEventListener('input', function () { paintRange(dutyEl); drawPWM(); });
    paintRange(dutyEl);
    window.addEventListener('resize', drawPWM);
    drawPWM();
  }

  /* ---------- 5. budget treemap ---------- */
  var tree = document.getElementById('treemap');
  if (tree) {
    // Structure line-items are taken verbatim from the report's PVC table
    // (they sum to $111.69, matching its stated $111.71 to a rounding cent).
    // Electronics is a single block: the report gives a $74.98 category total
    // but its per-item column can't be split reliably, because donated and
    // reused parts are mixed in with purchased ones.
    var DATA = [
      { n: 'Electronics',        v: 74.98, c: '#4fd1e0', d: 'Category total. Includes the Elegoo Mega, RS-485 modules, motor drivers, bilge pumps and wiring — several were donated or reused, so this is spend, not catalog value.' },
      { n: '4in PVC · 1ft',      v: 34.58, c: '#f2b544', d: 'Electronics compartment and motor guards' },
      { n: 'PVC tees ×12',       v: 23.04, c: '#e6a740', d: 'Frame joints — $1.92 each' },
      { n: '1.5in PVC · 10ft',   v: 12.78, c: '#d99a3f', d: 'Main frame stock' },
      { n: 'PVC elbows ×10',     v:  9.60, c: '#cd903d', d: 'Frame corners — $0.96 each' },
      { n: '4in rubber cap',     v:  9.81, c: '#c78f3c', d: 'Removable access cap for the electronics tube' },
      { n: 'Cement + primer',    v:  8.88, c: '#bd8639', d: 'PVC solvent welding' },
      { n: '3in dome',           v:  8.00, c: '#b37d36', d: 'Camera port' },
      { n: '4in end cap',        v:  5.00, c: '#a97433', d: 'Compartment end closure' }
    ];
    function squarify(items, x, y, w, h, out) {
      if (!items.length) return;
      if (items.length === 1) {
        out.push({ d: items[0], x: x, y: y, w: w, h: h });
        return;
      }
      var total = items.reduce(function (s, i) { return s + i.v; }, 0);
      var acc = 0, split = 1;
      var half = total / 2;
      for (var i = 0; i < items.length; i++) {
        acc += items[i].v;
        if (acc >= half) { split = i + 1; break; }
      }
      split = Math.min(Math.max(split, 1), items.length - 1);
      var aList = items.slice(0, split), bList = items.slice(split);
      var aSum = aList.reduce(function (s, i) { return s + i.v; }, 0);
      var ratio = aSum / total;
      if (w >= h) {
        squarify(aList, x, y, w * ratio, h, out);
        squarify(bList, x + w * ratio, y, w * (1 - ratio), h, out);
      } else {
        squarify(aList, x, y, w, h * ratio, out);
        squarify(bList, x, y + h * ratio, w, h * (1 - ratio), out);
      }
    }

    function renderTree() {
      tree.innerHTML = '';
      var cells = [];
      squarify(DATA.slice(), 0, 0, 100, 100, cells);
      cells.forEach(function (c) {
        var el = document.createElement('div');
        var small = c.w < 16 || c.h < 22;
        var xs = c.w < 11 || c.h < 15;
        el.className = 'tree__cell' + (small ? ' tree__cell--sm' : '') + (xs ? ' tree__cell--xs' : '');
        el.style.cssText =
          'left:' + c.x + '%;top:' + c.y + '%;width:' + c.w + '%;height:' + c.h + '%;' +
          'background:' + c.d.c + ';';
        el.tabIndex = 0;
        el.setAttribute('role', 'listitem');
        el.title = c.d.n + ' — $' + c.d.v.toFixed(2) + '\n' + c.d.d;
        el.setAttribute('aria-label', c.d.n + ', ' + c.d.v.toFixed(2) + ' dollars. ' + c.d.d);
        el.innerHTML =
          '<span class="tree__n">' + c.d.n + '</span>' +
          '<span class="tree__v">$' + c.d.v.toFixed(2) + '</span>';
        tree.appendChild(el);
      });
    }
    renderTree();
    window.addEventListener('resize', renderTree);
  }

  /* ---------- 6. scroll reveal ---------- */
  function revealAll(instant) {
    document.querySelectorAll('.rv').forEach(function (el) {
      // On the failsafe path, skip the transition entirely — a tab that was
      // backgrounded at load freezes transitions mid-flight and would otherwise
      // stay stuck at opacity 0 until something forces a repaint.
      if (instant) el.style.transition = 'none';
      el.classList.add('in');
    });
  }
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });
    // failsafe: if the observer never fires (background tab throttling, odd
    // engines), don't leave the page permanently invisible.
    setTimeout(function () { revealAll(true); }, 3000);
  } else {
    revealAll(true);
  }
})();
