/* ============================================================
   THE TAPE ROOM — archive library + retro-TV replay player
   Static, dependency-free. Everything is a fetched file.

   Data contract (written by arc-prize-2026/scripts/export_replays.py):
     replays/index.json            one row per run + palette + human medians
     replays/<env>__<runid>.json   turns[]: row-delta RLE frames + engine facts
     replays/<env>__<runid>.cot.json   per-turn reasoning, fetched ONLY when
                                       the CoT drawer is opened

   Frames stay RLE on the wire and are expanded here, one row at a time,
   straight into fillRect runs — so a 250-turn episode costs ~80 KB and the
   board stays exactly one canvas pixel per cell.
   ============================================================ */
(function () {
  'use strict';

  var DIR = 'replays/';
  var CELL_PX = 8;                 // 512 / 64 -- integer, so pixels stay crisp
  var GRID = 64;
  var BASE_MS = 620;               // 1x playback
  var SPEEDS = [0.5, 1, 2, 4];

  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var S = {
    index: null,
    rows: [],                      // every run row
    view: [],                      // filtered + sorted
    pal: [],
    run: null,                     // loaded run payload
    frames: [],                    // expanded RLE rows per turn index
    i: 0,
    playing: false,
    timer: null,
    speed: 1,
    cot: null,
    cotSlug: null,
    cotBusy: false,
    filters: { env: '', tick: false, notick: false, death: false,
               fresh: false, cont: false, sort: 'new' }
  };

  /* ---------------------------------------------------------------
     RLE -> canvas
     --------------------------------------------------------------- */

  function paintRows(ctx, rows, cell, pal) {
    ctx.fillStyle = '#05060d';
    ctx.fillRect(0, 0, GRID * cell, GRID * cell);
    if (!rows) return;
    for (var y = 0; y < rows.length && y < GRID; y++) {
      var line = rows[y];
      if (!line) continue;
      var toks = line.split(' ');
      var x = 0;
      for (var k = 0; k < toks.length; k++) {
        var t = toks[k];
        var p = t.indexOf('x');
        if (p < 1) continue;
        var c = +t.slice(0, p), n = +t.slice(p + 1);
        if (!(n > 0)) continue;
        if (c >= 0 && c < pal.length) {
          ctx.fillStyle = pal[c];
          ctx.fillRect(x * cell, y * cell, n * cell, cell);
        }
        x += n;
        if (x >= GRID) break;
      }
    }
  }

  /* Undo the exporter's row-delta encoding: null row == unchanged. */
  function expandFrames(turns) {
    var out = [], prev = null, i, y, rows;
    for (i = 0; i < turns.length; i++) {
      var wire = turns[i].r || [];
      if (!prev) {
        rows = wire.slice();
      } else {
        rows = new Array(wire.length);
        for (y = 0; y < wire.length; y++) {
          rows[y] = wire[y] === null || wire[y] === undefined ? prev[y] : wire[y];
        }
      }
      out.push(rows);
      prev = rows;
    }
    return out;
  }

  /* ---------------------------------------------------------------
     Small formatters
     --------------------------------------------------------------- */

  var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
             'Friday', 'Saturday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dayParts(day) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
    if (!m) return { label: day || 'undated', dow: '' };
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return {
      label: MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1],
      dow: DOW[d.getUTCDay()]
    };
  }

  function clockOf(row) {
    var s = row.started || '';
    return s.length >= 17 ? s.slice(11, 16) + ' UTC' : row.runid;
  }

  function slugOf(row) { return row.env + '__' + row.runid; }

  /* RHAE-style per-level efficiency: min(human/agent, 1) squared. */
  function levelEff(row, lv) {
    var h = (row.h_per_level || {})[String(lv.level)];
    if (!h || !lv.actions) return null;
    var r = Math.min(h / lv.actions, 1);
    return { h: h, a: lv.actions, eff: r * r };
  }

  function meanEff(row) {
    var vals = [], i, e;
    for (i = 0; i < (row.per_level || []).length; i++) {
      e = levelEff(row, row.per_level[i]);
      if (e) vals.push(e.eff);
    }
    if (!vals.length) return null;
    var s = 0;
    for (i = 0; i < vals.length; i++) s += vals[i];
    return s / vals.length;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /* ---------------------------------------------------------------
     ARCHIVE
     --------------------------------------------------------------- */

  function buildSlate() {
    var runs = S.rows, i, levels = 0, deaths = 0, turns = 0, ticked = 0;
    for (i = 0; i < runs.length; i++) {
      levels += runs[i].levels;
      deaths += runs[i].deaths;
      turns += runs[i].turns;
      if (runs[i].ticked) ticked++;
    }
    var envs = Object.keys(S.index.envs || {}).length;
    var days = {};
    for (i = 0; i < runs.length; i++) days[runs[i].day] = 1;

    var cells = [
      ['EPISODES', runs.length, ''],
      ['GAMES', envs, ''],
      ['NIGHTS', Object.keys(days).length, ''],
      ['TURNS PLAYED', turns.toLocaleString(), ''],
      ['LEVELS CLEARED', levels, 'in ' + ticked + ' runs', 'lvl'],
      ['DEATHS', deaths, '', 'die']
    ];
    var slate = $('slate');
    slate.textContent = '';
    for (i = 0; i < cells.length; i++) {
      var c = cells[i];
      var box = el('div', 'slate__cell' + (c[3] ? ' slate__cell--' + c[3] : ''));
      box.appendChild(el('span', 'slate__k', c[0]));
      var v = el('span', 'slate__v', String(c[1]));
      if (c[2]) v.appendChild(el('small', null, c[2]));
      box.appendChild(v);
      slate.appendChild(box);
    }

    var first = runs.length ? runs[runs.length - 1].day : '';
    var last = runs.length ? runs[0].day : '';
    $('kicker').textContent = 'Replay archive · ' + runs.length +
      ' episodes · ' + dayParts(first).label + ' – ' + dayParts(last).label;
  }

  function applyFilters() {
    var f = S.filters;
    var out = S.rows.filter(function (r) {
      if (f.env && r.env !== f.env) return false;
      if (f.tick && !r.ticked) return false;
      if (f.notick && r.ticked) return false;
      if (f.death && !r.deaths) return false;
      if (f.fresh && r.continuation) return false;
      if (f.cont && !r.continuation) return false;
      return true;
    });
    if (f.sort === 'levels') {
      out.sort(function (a, b) {
        return (b.levels - a.levels) || ((meanEff(b) || 0) - (meanEff(a) || 0)) ||
          (a.runid < b.runid ? 1 : -1);
      });
    } else if (f.sort === 'fewest') {
      out.sort(function (a, b) {
        var av = a.ticked ? a.per_level[0].actions : Infinity;
        var bv = b.ticked ? b.per_level[0].actions : Infinity;
        return (av - bv) || (a.runid < b.runid ? 1 : -1);
      });
    } else if (f.sort === 'longest') {
      out.sort(function (a, b) { return b.turns - a.turns; });
    }
    S.view = out;

    var active = f.env || f.tick || f.notick || f.death || f.fresh || f.cont;
    $('f-reset').hidden = !active;
    $('f-count').textContent = out.length === S.rows.length
      ? S.rows.length + ' episodes'
      : out.length + ' of ' + S.rows.length + ' episodes';
    renderDays();
  }

  function renderDays() {
    var host = $('days');
    host.textContent = '';
    $('nothing').hidden = S.view.length > 0;
    if (!S.view.length) return;

    // group by day, preserving the current sort inside each day, but with
    // days always newest-first (the sorts are stable within a day)
    var order = [], byDay = {};
    S.view.forEach(function (r) {
      if (!byDay[r.day]) { byDay[r.day] = []; order.push(r.day); }
      byDay[r.day].push(r);
    });
    order.sort().reverse();

    order.forEach(function (day, di) {
      var group = byDay[day];
      var levels = 0, deaths = 0, turns = 0;
      group.forEach(function (r) {
        levels += r.levels; deaths += r.deaths; turns += r.turns;
      });

      var d = el('details', 'day');
      d.open = true;
      d.style.setProperty('--d', di);
      var sum = el('summary');
      sum.appendChild(el('span', 'day__caret', '▸'));
      var dp = dayParts(day);
      sum.appendChild(el('span', 'day__date', dp.label));
      sum.appendChild(el('span', 'day__dow', dp.dow));
      var agg = el('div', 'day__agg');
      agg.appendChild(mini(group.length + ' run' + (group.length > 1 ? 's' : '')));
      agg.appendChild(mini(turns + ' turns'));
      if (levels) agg.appendChild(mini(levels + ' level' + (levels > 1 ? 's' : '') + ' cleared', 'lvl'));
      if (deaths) agg.appendChild(mini(deaths + ' death' + (deaths > 1 ? 's' : ''), 'die'));
      sum.appendChild(agg);
      d.appendChild(sum);

      var rows = el('div', 'day__rows');
      group.forEach(function (r) { rows.appendChild(runRow(r)); });
      d.appendChild(rows);
      host.appendChild(d);
    });
  }

  function mini(text, cls) {
    var s = el('span', cls || null);
    s.appendChild(el('b', null, text.split(' ')[0]));
    s.appendChild(document.createTextNode(' ' + text.split(' ').slice(1).join(' ')));
    return s;
  }

  function runRow(r) {
    var b = el('button', 'tape-row');
    b.type = 'button';
    b.dataset.slug = slugOf(r);
    b.dataset.tick = r.ticked ? '1' : '0';
    b.dataset.death = r.deaths ? '1' : '0';

    // 1. the still
    var still = el('canvas', 'tape-still');
    still.width = GRID; still.height = GRID;
    still.setAttribute('aria-hidden', 'true');
    if (r.thumb) paintRows(still.getContext('2d'), r.thumb, 1, S.pal);
    b.appendChild(still);

    // 2. the spine label
    var id = el('div', 'tape-id');
    id.appendChild(el('span', 'tape-env', r.env));
    id.appendChild(el('span', 'tape-time', clockOf(r)));
    id.appendChild(el('span', 'tape-cont' + (r.continuation ? '' : ' tape-cont--fresh'),
      r.continuation ? 'continuation' : 'fresh start'));
    b.appendChild(id);

    // 3. outcome
    var out = el('div', 'tape-out');
    var facts = el('div', 'tape-facts');
    facts.appendChild(fact(r.turns + ' turns'));
    if (r.levels) {
      var f1 = fact(r.levels + (r.levels > 1 ? ' levels' : ' level') + ' cleared', 'lvl');
      f1.insertBefore(el('i'), f1.firstChild);
      facts.appendChild(f1);
    }
    if (r.deaths) {
      var f2 = fact(r.deaths + (r.deaths > 1 ? ' deaths' : ' death'), 'die');
      f2.insertBefore(el('i'), f2.firstChild);
      facts.appendChild(f2);
    }
    if (r.per_level && r.per_level.length) {
      facts.appendChild(fact(r.per_level.map(function (l) {
        return 'L' + l.level + ' in ' + l.actions;
      }).join(' · ')));
    }
    out.appendChild(facts);

    var state = el('div', 'tape-state');
    var bits = [];
    if (r.aborted) bits.push('run aborted (transport)');
    else if (r.done) bits.push('episode finished');
    else bits.push('cut short');
    if (r.end_state === 'GAME_OVER') bits.push('GAME_OVER');
    state.textContent = bits.join(' · ');
    if (r.end_state === 'GAME_OVER') {
      state.textContent = bits[0] + ' · ';
      state.appendChild(el('em', null, 'GAME_OVER'));
    }
    out.appendChild(state);
    b.appendChild(out);

    // 4. activity sparkline (cells changed per turn)
    var spark = el('canvas', 'tape-spark');
    spark.width = 128; spark.height = 26;
    spark.setAttribute('aria-hidden', 'true');
    drawSpark(spark, r);
    b.appendChild(spark);

    // 5. efficiency vs the median human
    var m = meanEff(r);
    var eff = el('div', 'tape-eff' + (m === null ? ' tape-eff--none' : ''));
    eff.appendChild(el('span', 'tape-eff__v', m === null ? '—' : m.toFixed(2)));
    eff.appendChild(el('span', 'tape-eff__k',
      m === null ? 'no level cleared' : 'vs human median'));
    b.appendChild(eff);

    b.appendChild(el('span', 'tape-go', '▸'));

    var label = r.env + ', ' + clockOf(r) + ', ' + r.turns + ' turns, ' +
      (r.levels ? r.levels + ' levels cleared' : 'no level cleared') +
      (r.deaths ? ', ' + r.deaths + ' deaths' : '');
    b.setAttribute('aria-label', 'Open replay: ' + label);

    b.addEventListener('click', function () { openRun(slugOf(r), null, true); });
    return b;
  }

  function fact(text, kind) {
    var s = el('span', 'fact' + (kind ? ' fact--' + kind : ''));
    s.appendChild(document.createTextNode(text));
    return s;
  }

  function drawSpark(cv, r) {
    var ctx = cv.getContext('2d');
    var vals = r.spark || [];
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!vals.length) return;
    var max = Math.max.apply(null, vals) || 1;
    var w = cv.width / vals.length;
    ctx.fillStyle = 'rgba(28,46,74,.16)';
    ctx.fillRect(0, cv.height - 1, cv.width, 1);
    for (var i = 0; i < vals.length; i++) {
      var h = Math.max(1, Math.round((vals[i] / max) * (cv.height - 3)));
      ctx.fillStyle = vals[i] === 0 ? 'rgba(28,46,74,.16)' : 'rgba(10,92,196,.55)';
      ctx.fillRect(i * w, cv.height - h, Math.max(1, w - 0.7), h);
    }
    // level markers along the sparkline
    if (r.ticked && r.turns) {
      ctx.fillStyle = '#c79b00';
      (r.per_level || []).reduce(function (acc, l) {
        acc += l.actions;
        var x = Math.min(cv.width - 2, (acc / r.turns) * cv.width);
        ctx.fillRect(x, 0, 2, cv.height);
        return acc;
      }, 0);
    }
  }

  /* keyboard roving between rows */
  function archiveKeys(e) {
    var row = document.activeElement;
    if (!row || !row.classList || !row.classList.contains('tape-row')) return;
    var all = Array.prototype.slice.call(document.querySelectorAll('.tape-row'));
    var i = all.indexOf(row);
    var next = null;
    if (e.key === 'ArrowDown') next = all[i + 1];
    else if (e.key === 'ArrowUp') next = all[i - 1];
    else if (e.key === 'Home') next = all[0];
    else if (e.key === 'End') next = all[all.length - 1];
    if (next) { e.preventDefault(); next.focus(); }
  }

  /* ---------------------------------------------------------------
     PLAYER
     --------------------------------------------------------------- */

  var board, bctx, fx, fctx;

  function initCanvas() {
    board = $('board'); bctx = board.getContext('2d');
    fx = $('fx'); fctx = fx.getContext('2d');
    fx.style.transition = reduced ? 'none' : 'opacity .5s linear';
    fx.style.opacity = '0';
  }

  function rowFor(slug) {
    for (var i = 0; i < S.rows.length; i++) {
      if (slugOf(S.rows[i]) === slug) return S.rows[i];
    }
    return null;
  }

  function openRun(slug, turn, push) {
    var row = rowFor(slug);
    if (!row) { showArchive(true); return; }
    stop();
    var tv = $('tv');
    if (!reduced) {
      tv.classList.add('tuning');
      setTimeout(function () { tv.classList.remove('tuning'); }, 320);
    }
    $('view-archive').hidden = true;
    $('view-player').hidden = false;
    document.body.classList.add('viewing');
    jumpTop();

    S.cot = null; S.cotSlug = slug;
    $('cot-hint').textContent = 'LOADS ON OPEN';
    $('cot-think').textContent = '—';
    $('cot-say').textContent = '—';
    $('cot-meta').textContent = '';

    fetch(DIR + row.file, { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        if (S.cotSlug !== slug) return;   // user moved on already
        mountRun(row, payload, turn);
        if ($('cot').open) loadCot();
      })
      .catch(function () {
        $('r-act').textContent = 'could not load this replay';
      });

    if (push) {
      history.pushState({ run: slug }, '',
        '?run=' + encodeURIComponent(slug) + (turn !== null && turn !== undefined
          ? '&t=' + turn : ''));
    }
  }

  function mountRun(row, payload, turn) {
    S.run = payload;
    S.row = row;
    S.pal = payload.palette || S.pal;
    S.frames = expandFrames(payload.turns);

    $('p-env').textContent = payload.env;
    $('p-run').textContent = (payload.started || payload.runid).replace('T', ' ')
      .replace('Z', ' UTC');
    $('p-start').textContent = payload.continuation ? 'continuation' : 'fresh start';
    $('p-start').className = 'pchip' + (payload.continuation ? ' pchip--cont' : '');
    $('hud-env').textContent = payload.env.toUpperCase();

    var lv = (payload.levels || []).length;
    $('p-lvl').hidden = !lv;
    $('p-lvl').className = 'pchip pchip--lvl';
    $('p-lvl').textContent = lv + (lv > 1 ? ' levels cleared' : ' level cleared');
    var dd = payload.milestones.filter(function (m) { return m.kind === 'death'; }).length;
    $('p-die').hidden = !dd;
    $('p-die').className = 'pchip pchip--die';
    $('p-die').textContent = dd + (dd > 1 ? ' deaths' : ' death');

    var n = payload.turns.length;
    var sc = $('scrub');
    sc.max = String(Math.max(0, n - 1));
    sc.value = '0';

    buildNotches();
    buildStops();
    buildVs(row, payload);

    var sp = $('summary-panel');
    var ending = endingText(payload);
    sp.hidden = !ending;
    $('summary').textContent = ending || '';

    var idx = 0;
    if (turn !== null && turn !== undefined && turn !== '') idx = indexOfTurn(+turn);
    show(idx, true);
  }

  /* The harness writes its end-of-episode note as a tiny JSON blob
     ({won, turns}); render it as a sentence rather than dumping braces. */
  function endingText(p) {
    var lines = [];
    if (p.summary) {
      var body = p.summary.replace(/^EPISODE SUMMARY\s*/i, '').trim();
      var obj = null;
      try { obj = JSON.parse(body); } catch (e) { obj = null; }
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        var n = obj.turns;
        lines.push('The episode closed out on its own' +
          (typeof n === 'number' ? ' after ' + n + ' turns' : '') + '. ' +
          (obj.won ? 'The game was won.' : 'The game was not won.'));
        Object.keys(obj).forEach(function (k) {
          if (k !== 'won' && k !== 'turns') lines.push(k + ': ' + obj[k]);
        });
      } else if (body) {
        lines.push(body);
      }
    }
    if (p.aborted && p.abort_reason) lines.push(p.abort_reason);
    if (!lines.length && p.end_state === 'GAME_OVER') {
      lines.push('The run ended on GAME_OVER.');
    }
    if (!lines.length) {
      lines.push('No end-of-episode note was written — the run was cut off ' +
        'while it was still playing.');
    }
    return lines.join('\n\n');
  }

  function indexOfTurn(t) {
    var turns = S.run.turns, i, best = 0, bd = Infinity;
    for (i = 0; i < turns.length; i++) {
      var d = Math.abs(turns[i].t - t);
      if (d < bd) { bd = d; best = i; }
      if (d === 0) return i;
    }
    return best;
  }

  function buildNotches() {
    var host = $('notches');
    host.textContent = '';
    var n = S.run.turns.length;
    var kinds = {};
    S.run.milestones.forEach(function (m) {
      kinds[m.kind] = 1;
      var b = el('button', 'notch');
      b.type = 'button';
      b.dataset.kind = m.kind;
      b.style.left = (n > 1 ? (m.i / (n - 1)) * 100 : 0) + '%';
      b.appendChild(el('i'));
      b.title = 'turn ' + m.t + ' — ' + m.label;
      b.setAttribute('aria-label', 'Jump to turn ' + m.t + ': ' + m.label);
      b.addEventListener('click', function (e) {
        e.preventDefault(); stop(); show(m.i, true);
      });
      host.appendChild(b);
    });
    var leg = [];
    if (kinds.level) leg.push('◆ LEVEL');
    if (kinds.death) leg.push('● DEATH');
    if (kinds.gameover) leg.push('■ GAME OVER');
    $('stop-legend').textContent = leg.join('  ');
  }

  function buildStops() {
    var host = $('stops');
    host.textContent = '';
    if (!S.run.milestones.length) {
      host.appendChild(el('p', 'vs__none',
        'No level completions and no deaths in this run — it just played out.'));
      return;
    }
    S.run.milestones.forEach(function (m) {
      var b = el('button', 'stop');
      b.type = 'button';
      b.dataset.kind = m.kind;
      b.dataset.i = m.i;
      b.appendChild(el('span', 'stop__t', 'T' + m.t));
      b.appendChild(el('span', 'stop__txt', m.label.split('. ')[0]));
      b.addEventListener('click', function () { stop(); show(m.i, true); });
      host.appendChild(b);
    });
  }

  function buildVs(row, payload) {
    var host = $('vs');
    host.textContent = '';
    var levels = payload.levels || [];
    var hmap = row.h_per_level || {};

    if (!levels.length) {
      var h1 = hmap['1'];
      var msg = 'No level cleared, so this run scores nothing.';
      if (h1) {
        msg += ' A median human clears ' + payload.env + ' level 1 in ' + h1 +
          ' actions; this run spent ' + payload.turns.length + ' turns and did not get there.';
      }
      host.appendChild(el('p', 'vs__none', msg));
      return;
    }

    levels.forEach(function (lv) {
      var e = levelEff(row, lv);
      var wrap = el('div', 'vsrow');
      var head = el('div', 'vsrow__head');
      var left = el('span');
      left.appendChild(document.createTextNode('LEVEL ' + lv.level + ' — '));
      left.appendChild(el('b', null, lv.actions + ' actions'));
      head.appendChild(left);
      head.appendChild(el('span', null, e ? 'human median ' + e.h : 'no human baseline'));
      wrap.appendChild(head);

      var bar = el('div', 'vsbar');
      var span = e ? Math.max(e.h, e.a) : lv.actions;
      var fill = el('i');
      fill.style.width = Math.round((lv.actions / span) * 100) + '%';
      if (e && e.a > e.h) fill.className = 'over';
      bar.appendChild(fill);
      if (e) {
        var tick = el('u');
        tick.style.left = 'calc(' + Math.round((e.h / span) * 100) + '% - 1px)';
        tick.title = 'median human: ' + e.h + ' actions';
        bar.appendChild(tick);
      }
      wrap.appendChild(bar);

      var foot = el('p', 'vsrow__foot');
      if (e) {
        foot.appendChild(document.createTextNode('efficiency min(h/a,1)² = '));
        foot.appendChild(el('em', null, e.eff.toFixed(2)));
        if (lv.partial) {
          foot.appendChild(document.createTextNode(
            ' — partial: this level began in the previous run'));
        }
      } else {
        foot.textContent = 'no human baseline for this level';
      }
      wrap.appendChild(foot);
      host.appendChild(wrap);
    });
  }

  /* ---- the frame itself ---- */

  function show(i, jump) {
    if (!S.run) return;
    var n = S.run.turns.length;
    i = Math.max(0, Math.min(n - 1, i));
    S.i = i;
    var turn = S.run.turns[i];

    paintRows(bctx, S.frames[i], CELL_PX, S.pal);
    flashChanged(turn);

    $('hud-turn').textContent = 'TURN ' + turn.t;
    $('hud-act').textContent = turn.a || 'START';
    $('r-turn').textContent = turn.t;
    $('r-act').textContent = turn.a || '— first observation —';
    $('r-cells').textContent = turn.c === undefined || turn.c === null
      ? '—' : turn.c;
    var st = $('r-state');
    st.textContent = turn.st || '—';
    st.className = turn.st === 'GAME_OVER' ? 'over' : '';
    var sc = turn.s === undefined || turn.s === null ? null : turn.s;
    $('r-score').textContent = sc === null ? '—' : sc;

    $('scrub').value = String(i);
    $('counter').textContent = pad(i + 1) + ' / ' + pad(n);
    var pct = n > 1 ? (i / (n - 1)) * 100 : 0;
    $('track-fill').style.width = pct + '%';
    $('track-head').style.left = pct + '%';

    // milestone landing
    var hit = null;
    for (var k = 0; k < S.run.milestones.length; k++) {
      if (S.run.milestones[k].i === i) { hit = S.run.milestones[k]; break; }
    }
    markStop(i);
    stamp(hit);

    if ($('cot').open) renderCot();
    syncUrl(turn.t, jump);
  }

  function pad(v) { return String(v).length >= 3 ? String(v) : ('00' + v).slice(-3); }

  function flashChanged(turn) {
    fctx.clearRect(0, 0, fx.width, fx.height);
    var xy = turn.xy;
    if (!xy || !xy.length || reduced) { fx.style.opacity = '0'; return; }
    fctx.fillStyle = 'rgba(255,255,255,.85)';
    for (var i = 0; i < xy.length; i++) {
      fctx.fillRect(xy[i][0] * CELL_PX, xy[i][1] * CELL_PX, CELL_PX, CELL_PX);
    }
    fx.style.transition = 'none';
    fx.style.opacity = '0.55';
    // force reflow so the fade actually runs
    void fx.offsetWidth;
    fx.style.transition = 'opacity .5s linear';
    fx.style.opacity = '0';
  }

  var stampTimer = null;
  function stamp(m) {
    var s = $('stamp');
    var tv = $('tv');
    clearTimeout(stampTimer);
    tv.classList.remove('flash-lvl', 'flash-die');
    if (!m) { s.classList.remove('on'); return; }
    s.dataset.kind = m.kind;
    s.textContent = m.kind === 'level' ? 'LEVEL CLEARED'
      : m.kind === 'death' ? 'DEATH — RESET' : 'GAME OVER';
    s.classList.add('on');
    if (!reduced) {
      tv.classList.add(m.kind === 'level' ? 'flash-lvl' : 'flash-die');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          tv.classList.remove('flash-lvl', 'flash-die');
        });
      });
    }
    stampTimer = setTimeout(function () { s.classList.remove('on'); }, 2600);
  }

  function markStop(i) {
    var all = document.querySelectorAll('.stop');
    for (var k = 0; k < all.length; k++) {
      all[k].classList.toggle('on', +all[k].dataset.i === i);
    }
  }

  /* ---- transport ---- */

  function play() {
    if (!S.run || S.playing) return;
    if (S.i >= S.run.turns.length - 1) S.i = 0;
    S.playing = true;
    $('k-play').textContent = '❚❚';
    $('k-play').setAttribute('aria-pressed', 'true');
    $('k-play').setAttribute('aria-label', 'pause');
    $('tv').classList.add('playing');
    tick();
  }

  function tick() {
    clearTimeout(S.timer);
    S.timer = setTimeout(function () {
      if (!S.playing) return;
      if (S.i >= S.run.turns.length - 1) { stop(); return; }
      show(S.i + 1);
      tick();
    }, BASE_MS / S.speed);
  }

  function stop() {
    S.playing = false;
    clearTimeout(S.timer);
    var k = $('k-play');
    if (k) {
      k.textContent = '▶';
      k.setAttribute('aria-pressed', 'false');
      k.setAttribute('aria-label', 'play');
    }
    var tv = $('tv');
    if (tv) tv.classList.remove('playing');
  }

  function toggle() { S.playing ? stop() : play(); }

  function setSpeed(v) {
    S.speed = v;
    $('speed-val').textContent = v + 'x';
    var deg = -132 + (SPEEDS.indexOf(v) * 88);
    $('knob').querySelector('i').style.transform = 'rotate(' + deg + 'deg)';
    $('knob').setAttribute('aria-label', 'playback speed, currently ' + v +
      'x — click to change');
    if (S.playing) tick();
  }

  function bumpSpeed(dir) {
    var i = SPEEDS.indexOf(S.speed);
    setSpeed(SPEEDS[(i + (dir || 1) + SPEEDS.length) % SPEEDS.length]);
  }

  /* ---- CoT, fetched only when the drawer opens ---- */

  function loadCot() {
    if (!S.row || S.cot || S.cotBusy) { renderCot(); return; }
    S.cotBusy = true;
    var want = S.cotSlug;
    $('cot-hint').textContent = 'LOADING…';
    fetch(DIR + S.row.cot_file, { cache: 'force-cache' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        S.cotBusy = false;
        if (S.cotSlug !== want) return;
        S.cot = data;
        $('cot-hint').textContent = Object.keys(data.turns || {}).length +
          ' TURNS OF REASONING';
        renderCot();
      })
      .catch(function () {
        S.cotBusy = false;
        $('cot-hint').textContent = 'UNAVAILABLE';
      });
  }

  function renderCot() {
    if (!S.cot) return;
    var e = (S.cot.turns || {})[String(S.i)] || {};
    $('cot-think').textContent = e.reasoning ||
      'No private reasoning was recorded for this turn.';
    $('cot-say').textContent = e.response ||
      'The model wrote nothing at this turn.';
    var bits = [];
    if (e.cfg) bits.push(e.cfg);
    if (e.tokens) bits.push(e.tokens.completion + ' completion tokens');
    if (e.latency) bits.push(e.latency + 's');
    $('cot-meta').textContent = bits.join(' · ');
  }

  /* ---------------------------------------------------------------
     Routing
     --------------------------------------------------------------- */

  var urlTimer = null;
  function syncUrl(turn, immediate) {
    clearTimeout(urlTimer);
    var write = function () {
      if (!S.run) return;
      var q = '?run=' + encodeURIComponent(slugOf(S.run)) + '&t=' + turn;
      history.replaceState({ run: slugOf(S.run), t: turn }, '', q);
    };
    immediate ? write() : (urlTimer = setTimeout(write, 260));
  }

  function showArchive(push) {
    stop();
    S.run = null; S.row = null; S.cotSlug = null;
    $('view-player').hidden = true;
    $('view-archive').hidden = false;
    document.body.classList.remove('viewing');
    if (push) history.pushState({}, '', location.pathname);
    var focus = document.querySelector('.tape-row');
    if (focus) focus.focus({ preventScroll: true });
    jumpTop();
  }

  /* the shared stylesheet sets scroll-behavior:smooth, which animates (and
     gets clamped) when a view swap changes the document height -- so view
     changes jump instantly and only view changes do. */
  function jumpTop() {
    var html = document.documentElement;
    var prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    requestAnimationFrame(function () { html.style.scrollBehavior = prev; });
  }

  function route(push) {
    var q = new URLSearchParams(location.search);
    var run = q.get('run');
    if (run) openRun(run, q.get('t'), false);
    else {
      $('view-player').hidden = true;
      $('view-archive').hidden = false;
      document.body.classList.remove('viewing');
      stop();
    }
  }

  /* ---------------------------------------------------------------
     Wiring
     --------------------------------------------------------------- */

  function chip(id, key, exclusive) {
    var b = $(id);
    b.addEventListener('click', function () {
      var next = !S.filters[key];
      S.filters[key] = next;
      if (next && exclusive) {
        S.filters[exclusive] = false;
        $('f-' + exclusive).setAttribute('aria-pressed', 'false');
      }
      b.setAttribute('aria-pressed', next ? 'true' : 'false');
      applyFilters();
    });
  }

  function wire() {
    chip('f-tick', 'tick', 'notick');
    chip('f-notick', 'notick', 'tick');
    chip('f-death', 'death');
    chip('f-fresh', 'fresh', 'cont');
    chip('f-cont', 'cont', 'fresh');

    $('f-env').addEventListener('change', function () {
      S.filters.env = this.value; applyFilters();
    });
    $('f-sort').addEventListener('change', function () {
      S.filters.sort = this.value; applyFilters();
    });

    function reset() {
      S.filters = { env: '', tick: false, notick: false, death: false,
                    fresh: false, cont: false, sort: S.filters.sort };
      $('f-env').value = '';
      ['tick', 'notick', 'death', 'fresh', 'cont'].forEach(function (k) {
        $('f-' + k).setAttribute('aria-pressed', 'false');
      });
      applyFilters();
    }
    $('f-reset').addEventListener('click', reset);
    $('nothing-reset').addEventListener('click', reset);

    $('back').addEventListener('click', function () { showArchive(true); });
    $('k-play').addEventListener('click', toggle);
    $('k-first').addEventListener('click', function () { stop(); show(0, true); });
    $('k-last').addEventListener('click', function () {
      stop(); show(S.run ? S.run.turns.length - 1 : 0, true);
    });
    $('k-back').addEventListener('click', function () { stop(); show(S.i - 1, true); });
    $('k-fwd').addEventListener('click', function () { stop(); show(S.i + 1, true); });
    $('knob').addEventListener('click', function () { bumpSpeed(1); });

    $('scrub').addEventListener('input', function () {
      stop(); show(+this.value, false);
    });
    $('scrub').addEventListener('change', function () { syncUrl(S.run.turns[S.i].t, true); });

    var fxbox = $('crtfx');
    var saved = null;
    try { saved = localStorage.getItem('arc3.crtfx'); } catch (err) { saved = null; }
    if (saved === '0') fxbox.checked = false;
    var applyFx = function () {
      $('tv').classList.toggle('plain', !fxbox.checked);
      try { localStorage.setItem('arc3.crtfx', fxbox.checked ? '1' : '0'); }
      catch (err) { /* private mode */ }
    };
    fxbox.addEventListener('change', applyFx);
    applyFx();

    $('cot').addEventListener('toggle', function () {
      if (this.open) loadCot();
    });

    $('p-prev').addEventListener('click', function () { stepRun(-1); });
    $('p-next').addEventListener('click', function () { stepRun(1); });

    document.addEventListener('keydown', function (e) {
      var t = e.target;
      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' ||
        t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!$('view-player').hidden) {
        if (e.key === 'Escape') { showArchive(true); return; }
        if (typing && t.id !== 'scrub') return;
        if (e.key === ' ' || e.key === 'Spacebar') {
          if (t && t.tagName === 'BUTTON') return;   // let the button act
          e.preventDefault(); toggle();
        } else if (e.key === 'ArrowRight') {
          if (t && t.id === 'scrub') return;
          e.preventDefault(); stop(); show(S.i + (e.shiftKey ? 10 : 1), true);
        } else if (e.key === 'ArrowLeft') {
          if (t && t.id === 'scrub') return;
          e.preventDefault(); stop(); show(S.i - (e.shiftKey ? 10 : 1), true);
        } else if (e.key === 'Home') {
          e.preventDefault(); stop(); show(0, true);
        } else if (e.key === 'End') {
          e.preventDefault(); stop(); show(S.run ? S.run.turns.length - 1 : 0, true);
        } else if (e.key === ']') { bumpSpeed(1); }
        else if (e.key === '[') { bumpSpeed(-1); }
      } else if (!typing) {
        archiveKeys(e);
      }
    });

    window.addEventListener('popstate', function () { route(false); });
  }

  function stepRun(dir) {
    if (!S.run) return;
    var here = slugOf(S.run);
    var list = S.view.length ? S.view : S.rows;
    for (var i = 0; i < list.length; i++) {
      if (slugOf(list[i]) === here) {
        var next = list[i + dir];
        if (next) openRun(slugOf(next), null, true);
        return;
      }
    }
  }

  /* ---------------------------------------------------------------
     Boot
     --------------------------------------------------------------- */

  initCanvas();
  wire();

  fetch(DIR + 'index.json')
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (index) {
      S.index = index;
      S.pal = index.palette || [];
      S.rows = index.runs || [];

      var sel = $('f-env');
      Object.keys(index.envs || {}).sort().forEach(function (env) {
        var o = document.createElement('option');
        o.value = env;
        o.textContent = env + '  (' + index.envs[env].runs + ')';
        sel.appendChild(o);
      });

      buildSlate();
      applyFilters();
      route(false);
    })
    .catch(function () {
      $('kicker').textContent =
        'Replay archive · could not load replays/index.json';
      $('days').innerHTML =
        '<p class="nothing"><b>The archive did not load.</b>' +
        'Run the exporter to generate <code>replays/index.json</code>.</p>';
    });
})();
