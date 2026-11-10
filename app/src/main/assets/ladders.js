'use strict';
// Ladders and ropes (סולמות וחבלים): roll the die, climb ladders, slide down ropes, first to 100 wins.
// Landing on a rope plays the OTHER player's recorded laugh (if they recorded one).

const Ladders = (() => {
  const LADDERS = { 3: 22, 8: 30, 21: 42, 28: 84, 36: 57, 51: 67, 71: 91, 80: 99 };
  const ROPES = { 17: 7, 32: 10, 48: 26, 62: 19, 64: 45, 87: 24, 93: 73, 95: 75, 98: 79 };
  const STEP_MS = 190, SLIDE_MS = 750, ROLL_MS = 500;
  let G = null, geo = null, nextStarter = 'b';

  function newGame() {
    G = { pos: { b: 0, w: 0 }, turn: nextStarter, phase: 'roll', die: null, rolling: 0, anim: null, over: false, busy: false, msg: '', timer: 0 };
    nextStarter = opp(nextStarter);
    startTurn();
  }
  function later(fn, ms) { const g = G; clearTimeout(G.timer); G.timer = setTimeout(() => { if (G === g) fn(); }, ms); }

  function startTurn() {
    G.phase = 'roll';
    if (isCpu(G.turn)) { G.busy = true; later(() => { G.busy = false; roll(); }, 700); }
    App.update();
  }

  function roll() {
    if (!G || G.busy || G.over || G.phase !== 'roll') return;
    G.busy = true; G.phase = 'rolling'; G.rolling = performance.now(); G.msg = '';
    App.update();
    later(() => {
      G.rolling = 0;
      G.die = 1 + Math.floor(Math.random() * 6);
      move(G.die);
    }, ROLL_MS);
  }

  // walk step by step (bouncing back from 100), then ladder / rope
  function move(n) {
    const c = G.turn, start = G.pos[c];
    const path = [];
    let p = start, dir = 1;
    for (let k = 0; k < n; k++) { if (p === 100) dir = -1; p += dir; path.push(p); }
    if (start + n > 100) G.msg = 'צריך בדיוק ' + (100 - start) + ' כדי להגיע ל-100! חוזרים אחורה';
    G.phase = 'moving';
    let k = 0;
    const step = () => {
      if (k >= path.length) return afterWalk();
      G.anim = { color: c, from: G.pos[c], to: path[k], t0: performance.now(), dur: STEP_MS, hop: true };
      later(() => { G.pos[c] = path[k]; G.anim = null; k++; step(); }, STEP_MS);
      App.update();
    };
    step();
  }

  function afterWalk() {
    const c = G.turn, p = G.pos[c];
    const to = LADDERS[p] || ROPES[p];
    if (to) {
      const up = !!LADDERS[p];
      G.msg = up ? `🪜 סולם! ${NAMES[c]} ${gx(c, 'עולה', 'עולה')} ל-${to}` : `😱 חבל! ${NAMES[c]} ${gx(c, 'נופל', 'נופלת')} ל-${to}`;
      if (!up) Laugh.playRecorded(opp(c) === 'b' ? S.pb : S.pw); // the other player laughs
      G.anim = { color: c, from: p, to, t0: performance.now(), dur: SLIDE_MS, hop: false };
      App.update();
      later(() => { G.pos[c] = to; G.anim = null; endMove(); }, SLIDE_MS);
      return;
    }
    endMove();
  }

  function endMove() {
    const c = G.turn;
    if (G.pos[c] === 100) {
      G.over = true; G.busy = false; G.msg = '';
      App.update();
      later(() => App.showWin(c), 600);
      return;
    }
    G.busy = false;
    if (G.die === 6) {
      G.msg = (G.msg ? G.msg + '\n' : '') + '🎲 שש! עוד תור';
    } else G.turn = opp(c);
    startTurn();
  }

  function onTap() {
    if (!G || G.over || G.busy || isCpu(G.turn)) return;
    if (G.phase === 'roll') roll();
  }

  function status() {
    if (!G) return null;
    return {
      turn: G.turn,
      text: 'התור של ' + NAMES[G.turn] + (isCpu(G.turn) ? '\n(המחשב)' : ''),
      msg: G.msg || `${NAMES.b}: ${G.pos.b} · ${NAMES.w}: ${G.pos.w}`,
      roll: { label: '🎲 הטל קובייה', enabled: G.phase === 'roll' && !G.busy && !isCpu(G.turn) && !G.over },
      canUndo: false,
    };
  }

  // ---------- geometry ----------
  function resize(W, H) {
    const bs = Math.floor(Math.min(H - 12, W - 150));
    const cs = bs / 10;
    geo = { W, H, bs, cs, ox: Math.max(70, (W - bs) / 2), oy: (H - bs) / 2 };
  }
  // center of square n (1..100); 0 = start area left of the board
  function sqXY(n, c) {
    if (n <= 0) return [geo.ox - geo.cs * 0.9, geo.oy + geo.bs - geo.cs * (c === 'b' ? 1.7 : 0.6)];
    const row = Math.floor((n - 1) / 10);
    const col = row % 2 === 0 ? (n - 1) % 10 : 9 - (n - 1) % 10;
    return [geo.ox + (col + 0.5) * geo.cs, geo.oy + geo.bs - (row + 0.5) * geo.cs];
  }

  // ---------- drawing ----------
  const COLORS = ['#f6d7a7', '#f3b98a', '#bfe0c2', '#a9d3e8', '#f2c4d8'];

  function drawLadder(ctx, a, b) {
    const [x1, y1] = sqXY(a), [x2, y2] = sqXY(b);
    const ang = Math.atan2(y2 - y1, x2 - x1), w = geo.cs * 0.18;
    const nx = -Math.sin(ang) * w, ny = Math.cos(ang) * w;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = Math.max(3, geo.cs * 0.08);
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3;
    for (const s of [1, -1]) { ctx.beginPath(); ctx.moveTo(x1 + nx * s, y1 + ny * s); ctx.lineTo(x2 + nx * s, y2 + ny * s); ctx.stroke(); }
    const len = Math.hypot(x2 - x1, y2 - y1), rungs = Math.max(2, Math.floor(len / (geo.cs * 0.35)));
    ctx.lineWidth = Math.max(2, geo.cs * 0.05);
    for (let k = 1; k < rungs; k++) {
      const t = k / rungs, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      ctx.beginPath(); ctx.moveTo(x + nx, y + ny); ctx.lineTo(x - nx, y - ny); ctx.stroke();
    }
    ctx.restore();
  }

  function ropePoint(a, b, t) {
    const [x1, y1] = sqXY(a), [x2, y2] = sqXY(b);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    const wave = Math.sin(t * Math.PI * 3) * geo.cs * 0.35 * Math.sin(t * Math.PI);
    return [x1 + (x2 - x1) * t + nx * wave, y1 + (y2 - y1) * t + ny * wave];
  }
  function drawRope(ctx, a, b) {
    const pts = [];
    for (let k = 0; k <= 40; k++) pts.push(ropePoint(a, b, k / 40));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 3;
    ctx.strokeStyle = '#b5651d'; ctx.lineWidth = Math.max(4, geo.cs * 0.14);
    ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#f0d29a'; ctx.lineWidth = Math.max(1.5, geo.cs * 0.05);
    ctx.setLineDash([geo.cs * 0.08, geo.cs * 0.1]);
    ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.setLineDash([]);
    // knot at the top end
    const [kx, ky] = pts[0];
    ctx.fillStyle = '#8a4a12'; ctx.beginPath(); ctx.arc(kx, ky, geo.cs * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function tokenXY(c) {
    const a = G.anim;
    if (a && a.color === c) {
      const t = Math.min(1, (performance.now() - a.t0) / a.dur);
      if (a.hop) {
        const [x1, y1] = sqXY(a.from, c), [x2, y2] = sqXY(a.to, c);
        return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - Math.sin(Math.PI * t) * geo.cs * 0.4];
      }
      const e = ease(t);
      if (ROPES[a.from]) return ropePoint(a.from, a.to, e);
      const [x1, y1] = sqXY(a.from), [x2, y2] = sqXY(a.to);
      return [x1 + (x2 - x1) * e, y1 + (y2 - y1) * e];
    }
    const [x, y] = sqXY(G.pos[c], c);
    if (G.pos[c] > 0 && G.pos.b === G.pos.w) return [x + (c === 'b' ? -1 : 1) * geo.cs * 0.2, y];
    return [x, y];
  }

  function draw(ctx) {
    if (!G || !geo) return false;
    const { ox, oy, bs, cs } = geo;
    ctx.fillStyle = '#5a3a1f';
    roundRect(ctx, ox - 6, oy - 6, bs + 12, bs + 12, 8); ctx.fill();
    for (let n = 1; n <= 100; n++) {
      const [x, y] = sqXY(n);
      ctx.fillStyle = COLORS[(n * 7 + Math.floor((n - 1) / 10)) % COLORS.length];
      ctx.fillRect(x - cs / 2, y - cs / 2, cs + 0.5, cs + 0.5);
      ctx.fillStyle = 'rgba(60,40,20,0.75)';
      ctx.font = `bold ${Math.round(cs * 0.28)}px sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(String(n), x - cs / 2 + 2, y - cs / 2 + 1);
    }
    const [fx, fy] = sqXY(100);
    ctx.font = `${Math.round(cs * 0.5)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏆', fx, fy + cs * 0.08);
    for (const [a, b] of Object.entries(LADDERS)) drawLadder(ctx, +a, b);
    for (const [a, b] of Object.entries(ROPES)) drawRope(ctx, +a, b);

    // start area label
    ctx.fillStyle = '#f3e9d8'; ctx.font = `bold ${Math.round(cs * 0.32)}px sans-serif`;
    ctx.fillText('התחלה', ox - cs * 0.9, oy + bs - cs * 2.5);

    // tokens (current player on top)
    for (const c of [opp(G.turn), G.turn]) {
      const [x, y] = tokenXY(c);
      drawFacePiece(ctx, c, x, y, cs * 0.4, 0.84);
      if (c === G.turn && !G.over) glow(ctx, x, y, cs * 0.4, '#ffcf6b', 2.5);
    }

    // die to the right of the board
    const dx = Math.min(geo.W - cs * 0.9, ox + bs + (geo.W - ox - bs) / 2), dy = oy + bs / 2, ds = Math.min(56, cs * 1.3);
    let animating = !!G.anim;
    if (G.rolling) { drawDie(ctx, dx, dy, ds, 1 + Math.floor(Math.random() * 6), G.turn); animating = true; }
    else if (G.die) drawDie(ctx, dx, dy, ds, G.die, G.turn);
    if (G.phase === 'roll' && !G.busy && !isCpu(G.turn) && !G.over) {
      ctx.fillStyle = 'rgba(243, 233, 216, 0.85)'; ctx.font = `bold ${Math.round(cs * 0.3)}px sans-serif`;
      ctx.fillText('👆 הקש/י', dx, dy + ds * 0.9);
    }
    return animating;
  }

  function stop() { if (G) clearTimeout(G.timer); G = null; }
  const _t = { LADDERS, ROPES, get G() { return G; } };
  return { name: 'ladders', newGame, onTap, draw, resize, undo: () => {}, status, stop, roll, _t };
})();
