'use strict';
// Backgammon (שש-בש). Every checker shows a face: black = Emma, white = Dad.
// Point indexes 0..23. White moves 23 -> 0 (home 0..5, bottom right),
// black moves 0 -> 23 (home 18..23, top right). pts[i] > 0 = white checkers, < 0 = black.

const Backgammon = (() => {
  const STEP_MS = 260;
  let G = null;
  let geo = null;

  const sgn = c => (c === 'w' ? 1 : -1);
  const d6 = () => 1 + Math.floor(Math.random() * 6);

  function initState() {
    const pts = new Array(24).fill(0);
    pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
    pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
    return { pts, bar: { w: 0, b: 0 }, off: { w: 0, b: 0 } };
  }
  const cloneSt = s => ({ pts: s.pts.slice(), bar: { w: s.bar.w, b: s.bar.b }, off: { w: s.off.w, b: s.off.b } });
  const own = (s, c, i) => s.pts[i] * sgn(c) > 0;
  const stKey = s => s.pts.join(',') + '|' + s.bar.w + s.bar.b + '|' + s.off.w + ',' + s.off.b;

  // ---------- rules engine ----------
  function allHome(s, c) {
    if (s.bar[c]) return false;
    for (let i = 0; i < 24; i++) {
      if (c === 'w' && i > 5 && s.pts[i] > 0) return false;
      if (c === 'b' && i < 18 && s.pts[i] < 0) return false;
    }
    return true;
  }

  // Where a checker of color c at `from` ('bar' or index) lands with die d; null if illegal.
  function stepTarget(s, c, from, d) {
    let to;
    if (from === 'bar') to = c === 'w' ? 24 - d : d - 1;
    else to = from + (c === 'w' ? -d : d);
    if (to < 0 || to > 23) {
      if (from === 'bar' || !allHome(s, c)) return null;
      const exact = c === 'w' ? to === -1 : to === 24;
      if (!exact) {
        if (c === 'w') { for (let i = from + 1; i <= 5; i++) if (s.pts[i] > 0) return null; }
        else { for (let i = from - 1; i >= 18; i--) if (s.pts[i] < 0) return null; }
      }
      return 'off';
    }
    if (s.pts[to] * sgn(c) <= -2) return null; // blocked
    return to;
  }

  function applyStep(s, c, from, to) {
    const k = sgn(c);
    if (from === 'bar') s.bar[c]--; else s.pts[from] -= k;
    if (to === 'off') { s.off[c]++; return false; }
    let hit = false;
    if (s.pts[to] === -k) { s.pts[to] = 0; s.bar[opp(c)]++; hit = true; }
    s.pts[to] += k;
    return hit;
  }

  function sources(s, c) {
    if (s.bar[c]) return ['bar'];
    const out = [];
    for (let i = 0; i < 24; i++) if (own(s, c, i)) out.push(i);
    return out;
  }

  // All legal full-turn sequences (must use as many dice as possible; if only one die
  // of two different ones can be used, the larger one must be used when possible).
  function genSeqs(s, c, dice) {
    let list = [], max = 0;
    (function rec(st, remaining, seq) {
      let moved = false;
      const tried = new Set();
      for (let k = 0; k < remaining.length; k++) {
        const d = remaining[k];
        if (tried.has(d)) continue;
        tried.add(d);
        const rest = remaining.slice(0, k).concat(remaining.slice(k + 1));
        for (const f of sources(st, c)) {
          const to = stepTarget(st, c, f, d);
          if (to === null) continue;
          moved = true;
          const ns = cloneSt(st); applyStep(ns, c, f, to);
          rec(ns, rest, seq.concat([{ from: f, to, die: d }]));
        }
      }
      if (!moved && seq.length) {
        if (seq.length > max) { max = seq.length; list = []; }
        if (seq.length === max) list.push({ seq, st });
      }
    })(s, dice, []);
    if (max === 1 && dice.length === 2 && dice[0] !== dice[1]) {
      const big = Math.max(dice[0], dice[1]);
      if (list.some(o => o.seq[0].die === big)) list = list.filter(o => o.seq[0].die === big);
    }
    return { list, max };
  }

  function pips(s, c) {
    let p = s.bar[c] * 25;
    for (let i = 0; i < 24; i++) {
      const n = s.pts[i] * sgn(c);
      if (n > 0) p += n * (c === 'w' ? i + 1 : 24 - i);
    }
    return p;
  }

  // ---------- computer player ----------
  function evalSide(s, c) {
    const o = opp(c);
    let score = -pips(s, c) + s.off[c] * 2;
    // furthest-back opponent checker (in my direction of travel), for contact detection
    let contact = false;
    let oppBack = s.bar[o] ? (o === 'w' ? 24 : -1) : null;
    for (let i = 0; i < 24; i++) {
      if (s.pts[i] * sgn(o) > 0) {
        if (o === 'w') oppBack = oppBack === null ? i : Math.max(oppBack, i);
        else oppBack = oppBack === null ? i : Math.min(oppBack, i);
      }
    }
    let run = 0;
    for (let step = 0; step < 24; step++) {
      // walk points in my direction of travel
      const i = c === 'w' ? 23 - step : step;
      const n = s.pts[i] * sgn(c);
      const myHome = c === 'w' ? i <= 5 : i >= 18;
      if (oppBack !== null && (c === 'w' ? i < oppBack : i > oppBack)) contact = true;
      if (n >= 2) {
        score += 5 + (myHome ? 6 : 0);
        run++; score += run * 1.5; // primes
      } else {
        run = 0;
      }
      if (n === 1) {
        // can an opponent checker hit it?
        let threats = 0;
        for (let j = 0; j < 24; j++) {
          if (s.pts[j] * sgn(o) <= 0) continue;
          const dist = o === 'w' ? j - i : i - j;
          if (dist > 0 && dist <= 12) threats += dist <= 6 ? 2 : 1;
        }
        if (s.bar[o]) {
          const dist = o === 'w' ? 24 - i : i + 1;
          if (dist <= 12) threats += 2;
        }
        if (threats) score -= 6 + threats * 1.5 + (myHome ? 0 : (c === 'w' ? 24 - i : i + 1) * 0.3);
      }
    }
    score += s.bar[o] * 12;
    return { score, contact };
  }

  function evaluate(s, c) {
    const me = evalSide(s, c), them = evalSide(s, opp(c));
    if (s.off[c] === 15) return 1e6;
    if (!me.contact && !them.contact) return (pips(s, opp(c)) - pips(s, c)) * 3 + s.off[c] * 4;
    return me.score - them.score;
  }

  function chooseSeq() {
    const seen = new Map();
    for (const o of G.seqs) {
      const k = stKey(o.st);
      if (!seen.has(k)) seen.set(k, o);
    }
    const noise = S.level === 'easy' ? 40 : S.level === 'mid' ? 8 : 0;
    let best = null, bv = -Infinity;
    for (const o of seen.values()) {
      const v = evaluate(o.st, G.turn) + Math.random() * noise;
      if (v > bv) { bv = v; best = o; }
    }
    return best.seq;
  }

  // ---------- game flow ----------
  function newGame() {
    G = {
      st: initState(), turn: null, phase: 'opening', open: null,
      dice: [], seqs: [], max: 0, done: [], startSt: null,
      sel: null, anim: null, rolling: null, over: false, busy: false, msg: 'הטלה פותחת: מי שמקבל/ת מספר גבוה יותר מתחיל/ה', timer: 0,
    };
    App.update();
  }

  function later(fn, ms) {
    const g = G;
    clearTimeout(G.timer);
    G.timer = setTimeout(() => { if (G === g) fn(); }, ms);
  }

  function roll() {
    if (!G || G.busy || G.over) return;
    if (G.phase !== 'opening' && G.phase !== 'roll') return;
    G.busy = true;
    G.rolling = { t0: performance.now() };
    later(() => {
      G.rolling = null;
      G.busy = false;
      if (G.phase === 'opening') {
        const a = d6(), b = d6();
        G.open = { w: a, b };
        if (a === b) { G.msg = 'שוויון! מטילים שוב'; App.update(); return; }
        G.turn = a > b ? 'w' : 'b';
        startMove([a, b]);
      } else {
        G.open = null;
        const a = d6(), b = d6();
        startMove(a === b ? [a, a, a, a] : [a, b]);
      }
    }, 450);
    App.update();
  }

  function startMove(dice) {
    G.phase = 'move';
    G.dice = dice;
    G.done = [];
    G.sel = null;
    G.startSt = cloneSt(G.st);
    const r = genSeqs(G.st, G.turn, dice);
    G.seqs = r.list; G.max = r.max;
    G.msg = dice.length === 4 ? 'דאבל! 4 צעדים של ' + dice[0] : '';
    if (!G.max) {
      G.msg = 'אין מהלך אפשרי 😕';
      G.busy = true;
      later(() => { G.busy = false; endTurn(); }, 1700);
    } else if (isCpu(G.turn)) {
      G.busy = true;
      const seq = chooseSeq();
      const playNext = i => {
        if (i >= seq.length) { later(() => { G.busy = false; endTurn(); }, 450); return; }
        doStep(seq[i], () => later(() => playNext(i + 1), 220));
      };
      later(() => playNext(0), 500);
    } else {
      autoSelect();
    }
    App.update();
  }

  function endTurn() {
    if (G.over) return;
    G.turn = opp(G.turn);
    G.phase = 'roll';
    G.dice = []; G.done = []; G.seqs = []; G.max = 0; G.sel = null;
    G.msg = '';
    if (isCpu(G.turn)) later(roll, 600);
    App.update();
  }

  function nextSteps() {
    const k = G.done.length;
    const out = [];
    for (const o of G.seqs) {
      if (o.seq.length <= k) continue;
      let ok = true;
      for (let i = 0; i < k; i++) {
        if (o.seq[i].from !== G.done[i].from || o.seq[i].die !== G.done[i].die) { ok = false; break; }
      }
      if (!ok) continue;
      const s = o.seq[k];
      if (!out.some(x => x.from === s.from && x.die === s.die)) out.push(s);
    }
    return out;
  }

  function autoSelect() {
    G.sel = null;
    const steps = nextSteps();
    if (steps.length && steps.every(s => s.from === steps[0].from)) G.sel = steps[0].from;
  }

  function doStep(step, cb) {
    G.sel = null;
    const from = posOf(G.st, G.turn, step.from, true);
    const disp = cloneSt(G.st);
    if (step.from === 'bar') disp.bar[G.turn]--; else disp.pts[step.from] -= sgn(G.turn);
    const to = posOf(disp, G.turn, step.to, false);
    G.anim = { color: G.turn, from, to, disp, t0: performance.now(), cb: () => {
      applyStep(G.st, G.turn, step.from, step.to);
      G.done.push(step);
      if (G.st.off[G.turn] === 15) { win(); return; }
      if (cb) cb();
      else if (G.done.length === G.max) {
        G.busy = true;
        G.msg = 'סיום תור…';
        later(() => { G.busy = false; endTurn(); }, 750);
      } else autoSelect();
      App.update();
    } };
    App.update();
  }

  function win() {
    G.over = true; G.busy = false;
    clearTimeout(G.timer);
    App.update();
    App.showWin(G.turn, winKind(G.st, G.turn));
  }

  // 'turkish' = מארס טורקי (loser bore off nothing and still has a checker on the bar
  // or in the winner's home board), 'mars' = מארס, '' = regular win.
  function winKind(s, winner) {
    const loser = opp(winner);
    if (s.off[loser] > 0) return '';
    if (s.bar[loser] > 0) return 'turkish';
    for (let i = 0; i < 24; i++) {
      const inWinnerHome = winner === 'w' ? i <= 5 : i >= 18;
      if (inWinnerHome && s.pts[i] * sgn(loser) > 0) return 'turkish';
    }
    return 'mars';
  }

  function undo() {
    if (!G || G.phase !== 'move' || isCpu(G.turn) || G.anim || !G.done.length || G.over) return;
    clearTimeout(G.timer);
    G.busy = false;
    G.done.pop();
    G.st = cloneSt(G.startSt);
    for (const s of G.done) applyStep(G.st, G.turn, s.from, s.to);
    G.msg = '';
    autoSelect();
    App.update();
  }

  function onTap(x, y) {
    if (!G || G.over) return;
    if (G.phase === 'opening' || (G.phase === 'roll' && !isCpu(G.turn))) { roll(); return; }
    if (G.busy || G.phase !== 'move' || isCpu(G.turn)) return;
    const hit = hitTest(x, y);
    const steps = nextSteps();
    if (G.sel !== null && hit !== null) {
      const s = steps.find(s => s.from === G.sel && s.to === hit);
      if (s) { doStep(s); return; }
    }
    if (hit !== null && steps.some(s => s.from === hit)) G.sel = hit;
    else if (hit !== null && G.sel === null) {
      // tapped a destination directly: if exactly one checker can get there, move it
      const s = steps.filter(s => s.to === hit);
      if (s.length === 1) { doStep(s[0]); return; }
      G.sel = null;
    } else G.sel = null;
  }

  function status() {
    if (!G) return null;
    let text, roll = null;
    if (G.phase === 'opening') {
      text = 'הטלה פותחת';
      roll = { label: '🎲 הטלה פותחת', enabled: !G.busy };
    } else {
      text = 'התור של ' + NAMES[G.turn] + (isCpu(G.turn) ? '\n(המחשב)' : '');
      roll = { label: '🎲 הטל קוביות', enabled: G.phase === 'roll' && !G.busy && !isCpu(G.turn) && !G.over };
    }
    let msg = G.msg;
    if (G.phase === 'move' && !msg && !isCpu(G.turn)) msg = G.sel === null ? 'בחר/י כלי להזיז' : 'בחר/י לאן להזיז';
    msg += (msg ? '\n' : '') + `פיפס: אמה ${pips(G.st, 'b')} · אבא ${pips(G.st, 'w')}`;
    const canUndo = G.phase === 'move' && !isCpu(G.turn) && !G.anim && G.done.length > 0 && !G.over;
    return { turn: G.turn, text, msg, roll, canUndo };
  }

  // ---------- geometry ----------
  function resize(W, H) {
    const m = 4, f = 9;
    const ix = m + f, iy = m + f, iw = W - 2 * (m + f), ih = H - 2 * (m + f);
    const pw = iw / 13.8, B = pw * 0.9, T = pw * 0.9;
    const r = Math.min(pw * 0.47, ih * 0.056);
    geo = { W, H, m, f, ix, iy, iw, ih, pw, B, T, r, stack: ih * 0.46, triH: ih * 0.42,
      barX: ix + 6 * pw + B / 2, trayX: ix + 12 * pw + B, midY: iy + ih / 2 };
  }
  const colX = col => geo.ix + col * geo.pw + (col >= 6 ? geo.B : 0) + geo.pw / 2;
  const pointX = i => colX(i < 12 ? 11 - i : i - 12);
  const isTop = i => i >= 12;
  const spacing = n => (n <= 1 ? 0 : Math.min(geo.r * 2, (geo.stack - 2 * geo.r) / (n - 1)));

  // position of the k-th checker (0 = at the edge) on point i holding n checkers
  function checkerXY(i, k, n) {
    const sp = spacing(Math.max(n, 5));
    const x = pointX(i);
    const y = isTop(i) ? geo.iy + geo.r + k * sp : geo.iy + geo.ih - geo.r - k * sp;
    return [x, y];
  }
  function barXY(c, k, n) {
    const sp = Math.min(geo.r * 2, (geo.ih / 2 - geo.r * 2 - 6) / Math.max(1, n - 1));
    const y = c === 'b' ? geo.midY - geo.r - 6 - k * sp : geo.midY + geo.r + 6 + k * sp;
    return [geo.barX, y];
  }
  const slabH = () => Math.min(8, (geo.ih / 2 - 24) / 15);
  function offXY(c, k) {
    const x = geo.trayX + geo.T / 2;
    return [x, c === 'b' ? geo.iy + 4 + (k + 0.5) * slabH() : geo.iy + geo.ih - 4 - (k + 0.5) * slabH()];
  }
  // pixel position of the top checker at `where` (top=true) or the next free slot (top=false)
  function posOf(s, c, where, top) {
    if (where === 'off') return offXY(c, s.off[c] - (top ? 1 : 0));
    if (where === 'bar') { const n = s.bar[c]; return barXY(c, top ? n - 1 : n, n + (top ? 0 : 1)); }
    const n = Math.abs(s.pts[where]);
    const ownerHere = s.pts[where] * sgn(c) > 0;
    if (top) return checkerXY(where, n - 1, n);
    // a hit blot is replaced, so land at slot 0
    return checkerXY(where, ownerHere ? n : 0, ownerHere ? n + 1 : 1);
  }

  function hitTest(x, y) {
    const { ix, iy, iw, ih, pw, B } = geo;
    if (y < iy - 6 || y > iy + ih + 6) return null;
    if (x >= geo.trayX - 4) return 'off';
    if (Math.abs(x - geo.barX) <= B / 2) return 'bar';
    let col;
    if (x < ix + 6 * pw) col = Math.floor((x - ix) / pw);
    else col = 6 + Math.floor((x - (ix + 6 * pw + B)) / pw);
    if (col < 0 || col > 11) return null;
    return y < geo.midY ? 12 + col : 11 - col;
  }

  // ---------- drawing ----------
  function draw(ctx) {
    if (!G || !geo) return false;
    const { W, H, m, ix, iy, iw, ih, pw, B, T, r } = geo;
    let animating = false;

    // board
    ctx.fillStyle = '#5a3a1f';
    roundRect(ctx, m, m, W - 2 * m, H - 2 * m, 10); ctx.fill();
    ctx.fillStyle = '#2f6b4c';
    ctx.fillRect(ix, iy, 6 * pw, ih);
    ctx.fillRect(ix + 6 * pw + B, iy, 6 * pw, ih);
    ctx.fillStyle = '#4a2f18';
    ctx.fillRect(ix + 6 * pw, iy, B, ih);           // bar
    ctx.fillStyle = '#3d2614';
    ctx.fillRect(geo.trayX, iy, T, ih);              // tray

    const steps = (G.phase === 'move' && !G.busy && !isCpu(G.turn)) ? nextSteps() : [];
    const targets = G.sel !== null ? steps.filter(s => s.from === G.sel).map(s => s.to) : [];

    for (let i = 0; i < 24; i++) {
      const x = pointX(i), top = isTop(i);
      const col = i < 12 ? 11 - i : i - 12;
      const y0 = top ? iy : iy + ih, y1 = top ? iy + geo.triH : iy + ih - geo.triH;
      ctx.beginPath();
      ctx.moveTo(x - pw / 2 + 1, y0); ctx.lineTo(x + pw / 2 - 1, y0); ctx.lineTo(x, y1); ctx.closePath();
      ctx.fillStyle = col % 2 ? '#e3cf9f' : '#b8432f';
      ctx.fill();
      if (targets.includes(i)) {
        ctx.fillStyle = 'rgba(63, 224, 122, 0.55)'; ctx.fill();
      }
    }
    if (targets.includes('off')) {
      ctx.fillStyle = 'rgba(63, 224, 122, 0.45)';
      ctx.fillRect(geo.trayX, G.turn === 'b' ? iy : iy + ih / 2, T, ih / 2);
    }

    // state to show (during animation the moving checker is lifted off its source)
    let s = G.st, moving = null;
    if (G.anim) {
      const a = G.anim;
      const t = (performance.now() - a.t0) / STEP_MS;
      if (t >= 1) { G.anim = null; a.cb(); return draw(ctx) || true; }
      s = a.disp;
      const f = ease(t);
      moving = { c: a.color, x: a.from[0] + (a.to[0] - a.from[0]) * f, y: a.from[1] + (a.to[1] - a.from[1]) * f - Math.sin(Math.PI * f) * r * 1.2 };
      animating = true;
    }

    // checkers on points
    for (let i = 0; i < 24; i++) {
      const v = s.pts[i]; if (!v) continue;
      const c = v > 0 ? 'w' : 'b', n = Math.abs(v);
      for (let k = 0; k < n; k++) { const [x, y] = checkerXY(i, k, n); drawFacePiece(ctx, c, x, y, r); }
      if (n > 5) label(ctx, ...checkerXY(i, n - 1, n), n);
    }
    // bar
    for (const c of ['b', 'w']) {
      const n = s.bar[c];
      for (let k = 0; k < n; k++) { const [x, y] = barXY(c, k, n); drawFacePiece(ctx, c, x, y, r); }
      if (n > 1) label(ctx, ...barXY(c, n - 1, n), n);
    }
    // borne off
    for (const c of ['b', 'w']) {
      for (let k = 0; k < s.off[c]; k++) {
        const [x, y] = offXY(c, k), h = slabH();
        roundRect(ctx, x - T * 0.4, y - h * 0.45, T * 0.8, h * 0.9, 2);
        ctx.fillStyle = c === 'w' ? '#f4f1ea' : '#1d1d1f'; ctx.fill();
        ctx.strokeStyle = c === 'w' ? '#999' : '#555'; ctx.lineWidth = 1; ctx.stroke();
      }
      if (s.off[c]) {
        const [x, y] = offXY(c, s.off[c] + 1);
        ctx.fillStyle = '#f3e9d8'; ctx.font = `bold ${Math.round(r * 0.8)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(s.off[c]), x, y + (c === 'b' ? r * 0.3 : -r * 0.3));
      }
    }

    // highlight movable checkers / selection
    if (steps.length && !G.anim) {
      const srcs = [...new Set(steps.map(st => st.from))];
      for (const f of srcs) {
        const [x, y] = posOf(s, G.turn, f, true);
        glow(ctx, x, y, r, f === G.sel ? '#3fe07a' : 'rgba(255, 200, 60, 0.9)', f === G.sel ? 4 : 2.5);
      }
    }

    // dice
    const dy = geo.midY, ds = Math.min(pw * 0.85, ih * 0.13);
    const leftCx = ix + 3 * pw, rightCx = ix + 9 * pw + B;
    if (G.rolling) {
      animating = true;
      const c = G.phase === 'opening' ? null : G.turn;
      if (c) {
        drawDie(ctx, rightCx - ds * 0.65, dy, ds, d6(), c);
        drawDie(ctx, rightCx + ds * 0.65, dy, ds, d6(), c);
      } else {
        drawDie(ctx, leftCx, dy, ds, d6(), 'b');
        drawDie(ctx, rightCx, dy, ds, d6(), 'w');
      }
    } else if (G.phase === 'move' || (G.phase === 'opening' && G.open)) {
      if (G.open) {
        drawDie(ctx, leftCx, dy, ds, G.open.b, 'b', G.phase === 'move' ? 0.5 : 1);
        drawDie(ctx, rightCx, dy, ds, G.open.w, 'w', G.phase === 'move' ? 0.5 : 1);
      }
      if (G.phase === 'move') {
        const used = G.done.map(d => d.die);
        const list = G.dice.map(v => { const k = used.indexOf(v); if (k >= 0) { used.splice(k, 1); return [v, true]; } return [v, false]; });
        const cx = G.turn === 'b' ? leftCx : rightCx;
        const sz = list.length === 4 ? ds * 0.8 : ds;
        const gap = sz * 1.25;
        list.forEach(([v, u], j) => drawDie(ctx, cx + (j - (list.length - 1) / 2) * gap, dy, sz, v, G.turn, u ? 0.28 : 1));
      }
    } else if (G.phase === 'roll' && !isCpu(G.turn) && !G.over) {
      ctx.fillStyle = 'rgba(243, 233, 216, 0.8)';
      ctx.font = `bold ${Math.round(ds * 0.42)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('👆 הקש/י להטלת קוביות', G.turn === 'b' ? leftCx : rightCx, dy);
    }

    if (moving) drawFacePiece(ctx, moving.c, moving.x, moving.y, r);
    return animating;
  }

  function label(ctx, x, y, n) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, geo.r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(201, 130, 43, 0.95)'; ctx.fill();
    ctx.fillStyle = '#1b1410'; ctx.font = `bold ${Math.round(geo.r * 0.62)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), x, y + 1);
    ctx.restore();
  }

  function stop() { if (G) clearTimeout(G.timer); G = null; }

  const tapXY = w => w === 'off' ? [geo.trayX + geo.T / 2, geo.midY + (G.turn === 'b' ? -1 : 1) * geo.ih / 4]
    : w === 'bar' ? [geo.barX, geo.midY + (G.turn === 'b' ? -1 : 1) * geo.ih / 4]
    : [pointX(w), isTop(w) ? geo.iy + geo.triH / 2 : geo.iy + geo.ih - geo.triH / 2];
  const _t = { winKind, tapXY, initState, genSeqs, applyStep, stepTarget, pips, evaluate, get G() { return G; } };
  return { name: 'backgammon', newGame, onTap, draw, resize, undo, status, stop, roll, _t };
})();
