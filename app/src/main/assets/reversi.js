'use strict';
// Reversi (רברסי): place a face so it traps the opponent's faces in a line; they flip to yours.

const Reversi = (() => {
  const N = 8;
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const FLIP_MS = 320;
  const WEIGHTS = [
    120, -20, 20, 5, 5, 20, -20, 120,
    -20, -40, -5, -5, -5, -5, -40, -20,
    20, -5, 15, 3, 3, 15, -5, 20,
    5, -5, 3, 3, 3, 3, -5, 5,
    5, -5, 3, 3, 3, 3, -5, 5,
    20, -5, 15, 3, 3, 15, -5, 20,
    -20, -40, -5, -5, -5, -5, -40, -20,
    120, -20, 20, 5, 5, 20, -20, 120,
  ];
  let G = null, geo = null;

  function initBoard() {
    const b = Array(N * N).fill(null);
    b[3 * N + 3] = 'w'; b[4 * N + 4] = 'w'; b[3 * N + 4] = 'b'; b[4 * N + 3] = 'b';
    return b;
  }

  function flipsFor(b, i, color) {
    if (b[i]) return [];
    const r = Math.floor(i / N), c = i % N, o = opp(color), out = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === o) { line.push(rr * N + cc); rr += dr; cc += dc; }
      if (line.length && rr >= 0 && rr < N && cc >= 0 && cc < N && b[rr * N + cc] === color) out.push(...line);
    }
    return out;
  }
  function moves(b, color) {
    const out = [];
    for (let i = 0; i < N * N; i++) { const f = flipsFor(b, i, color); if (f.length) out.push({ i, f }); }
    return out;
  }
  function apply(b, m, color) { b[m.i] = color; for (const k of m.f) b[k] = color; }
  const count = (b, c) => b.reduce((n, v) => n + (v === c), 0);

  // ---------- computer ----------
  const ABORT = {};
  let deadline = 0, nodes = 0;
  function evaluate(b, me) {
    const op = opp(me);
    let s = 0;
    for (let i = 0; i < N * N; i++) { if (b[i] === me) s += WEIGHTS[i]; else if (b[i] === op) s -= WEIGHTS[i]; }
    s += (moves(b, me).length - moves(b, op).length) * 4;
    return s;
  }
  function negamax(b, turn, depth, alpha, beta, passed) {
    if ((++nodes & 255) === 0 && performance.now() > deadline) throw ABORT;
    const ms = moves(b, turn);
    if (!ms.length) {
      if (passed) { const d = count(b, turn) - count(b, opp(turn)); return d * 1000; }
      return -negamax(b, opp(turn), depth, -beta, -alpha, true);
    }
    if (depth === 0) return evaluate(b, turn);
    ms.sort((a, c) => WEIGHTS[c.i] - WEIGHTS[a.i]);
    let best = -Infinity;
    for (const m of ms) {
      const nb = b.slice(); apply(nb, m, turn);
      const v = -negamax(nb, opp(turn), depth - 1, -beta, -alpha, false);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  function chooseMove() {
    const ms = shuffle(G.legal.slice());
    if (S.level === 'easy') {
      let best = ms[0], bv = -Infinity;
      for (const m of ms) { const v = m.f.length * 3 + WEIGHTS[m.i] * 0.3 + Math.random() * 40; if (v > bv) { bv = v; best = m; } }
      return best;
    }
    const maxD = S.level === 'mid' ? 3 : 10;
    deadline = performance.now() + (S.level === 'hard' ? 1300 : 400);
    nodes = 0;
    let chosen = ms[0];
    for (let d = 1; d <= maxD; d++) {
      try {
        let best = null, bv = -Infinity;
        for (const m of ms) {
          const nb = G.board.slice(); apply(nb, m, G.turn);
          const v = -negamax(nb, opp(G.turn), d - 1, -Infinity, -bv, false);
          if (v > bv) { bv = v; best = m; }
        }
        chosen = best;
        ms.splice(ms.indexOf(best), 1); ms.unshift(best);
      } catch (e) { if (e !== ABORT) throw e; break; }
    }
    return chosen;
  }

  // ---------- game flow ----------
  function newGame() {
    G = { board: initBoard(), turn: 'b', legal: [], hist: [], anim: {}, last: -1, over: false, busy: false, msg: '' };
    startTurn();
  }

  function later(fn, ms) { const g = G; setTimeout(() => { if (G === g) fn(); }, ms); }

  function startTurn() {
    G.legal = moves(G.board, G.turn);
    if (!G.legal.length) {
      if (!moves(G.board, opp(G.turn)).length) return finish();
      G.msg = `ל${NAMES[G.turn]} אין מהלך – התור עובר`;
      G.busy = true;
      App.update();
      later(() => { G.busy = false; G.turn = opp(G.turn); startTurn(); }, 1600);
      return;
    }
    G.msg = '';
    if (isCpu(G.turn)) {
      G.busy = true; G.msg = 'המחשב חושב…';
      App.update();
      later(() => play(chooseMove()), 450);
      return;
    }
    App.update();
  }

  function play(m) {
    G.hist.push({ board: G.board.slice(), turn: G.turn, last: G.last });
    apply(G.board, m, G.turn);
    G.last = m.i;
    const now = performance.now();
    const r0 = Math.floor(m.i / N), c0 = m.i % N;
    G.anim = { [m.i]: { t: now, from: null } };
    for (const k of m.f) {
      const d = Math.max(Math.abs(Math.floor(k / N) - r0), Math.abs(k % N - c0));
      G.anim[k] = { t: now + d * 70, from: opp(G.turn) };
    }
    G.msg = '';
    G.busy = true;
    App.update();
    const wait = 70 * N + FLIP_MS;
    later(() => { G.busy = false; G.turn = opp(G.turn); startTurn(); }, Math.min(wait, 120 + m.f.length * 70 + FLIP_MS));
  }

  function finish() {
    G.over = true; G.busy = false;
    const b = count(G.board, 'b'), w = count(G.board, 'w');
    G.msg = '';
    App.update();
    later(() => App.showWin(b === w ? null : b > w ? 'b' : 'w', '', `${NAMES.b} ${b} : ${w} ${NAMES.w}`), 700);
  }

  function onTap(x, y) {
    if (!G || G.busy || G.over || isCpu(G.turn)) return;
    const c = Math.floor((x - geo.ox) / geo.sq), r = Math.floor((y - geo.oy) / geo.sq);
    if (r < 0 || r >= N || c < 0 || c >= N) return;
    const m = G.legal.find(m => m.i === r * N + c);
    if (m) play(m);
    else G.msg = 'אפשר לשים רק במקום שמסומן בנקודה';
  }

  function undo() {
    if (!G || G.busy || !G.hist.length) return;
    let h = G.hist.pop();
    if (S.opponent === 'cpu') {
      while (isCpu(h.turn) && G.hist.length) h = G.hist.pop();
      if (isCpu(h.turn)) { G.hist.push(h); return; }
    }
    G.board = h.board; G.turn = h.turn; G.last = h.last; G.anim = {}; G.over = false;
    App.hideWin();
    startTurn();
  }
  function canUndo() {
    if (!G || G.busy || !G.hist.length) return false;
    return S.opponent === 'cpu' ? G.hist.some(h => !isCpu(h.turn)) : true;
  }

  function status() {
    if (!G) return null;
    const sc = `${NAMES.b}: ${count(G.board, 'b')} · ${NAMES.w}: ${count(G.board, 'w')}`;
    return { turn: G.turn, text: 'התור של ' + NAMES[G.turn] + (isCpu(G.turn) ? '\n(המחשב)' : ''), msg: (G.msg ? G.msg + '\n' : '') + sc, roll: null, canUndo: canUndo() };
  }

  // ---------- drawing ----------
  function resize(W, H) {
    const bs = Math.floor(Math.min(W, H) - 12);
    geo = { W, H, bs, sq: bs / N, ox: (W - bs) / 2, oy: (H - bs) / 2 };
  }

  function draw(ctx) {
    if (!G || !geo) return false;
    const { ox, oy, sq, bs } = geo;
    const now = performance.now();
    let animating = false;
    ctx.fillStyle = '#5a3a1f';
    roundRect(ctx, ox - 6, oy - 6, bs + 12, bs + 12, 8); ctx.fill();
    ctx.fillStyle = '#2f7a4f'; ctx.fillRect(ox, oy, bs, bs);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
    for (let k = 0; k <= N; k++) {
      ctx.beginPath(); ctx.moveTo(ox + k * sq, oy); ctx.lineTo(ox + k * sq, oy + bs); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + k * sq); ctx.lineTo(ox + bs, oy + k * sq); ctx.stroke();
    }
    const human = !G.busy && !G.over && !isCpu(G.turn);
    for (let i = 0; i < N * N; i++) {
      const x = ox + (i % N + 0.5) * sq, y = oy + (Math.floor(i / N) + 0.5) * sq;
      if (i === G.last) { ctx.fillStyle = 'rgba(255, 220, 80, 0.25)'; ctx.fillRect(x - sq / 2, y - sq / 2, sq, sq); }
      const v = G.board[i];
      if (!v) {
        if (human && G.legal.some(m => m.i === i)) {
          ctx.beginPath(); ctx.arc(x, y, sq * 0.12, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'; ctx.fill();
        }
        continue;
      }
      const a = G.anim[i];
      let color = v, sx = 1, scale = 1;
      if (a) {
        const t = (now - a.t) / FLIP_MS;
        if (t < 1) {
          animating = true;
          if (a.from === null) scale = t < 0 ? 0 : 0.5 + 0.5 * ease(Math.max(0, t));
          else { const tt = Math.max(0, t); color = tt < 0.5 ? a.from : v; sx = Math.abs(Math.cos(Math.PI * tt)) || 0.02; }
        }
      }
      if (scale <= 0) continue;
      ctx.save();
      ctx.translate(x, y); ctx.scale(sx * scale, scale);
      drawFacePiece(ctx, color, 0, 0, sq * 0.42, 0.84);
      ctx.restore();
    }
    return animating;
  }

  function stop() { G = null; }
  const _t = { initBoard, moves, apply, count, get G() { return G; } };
  return { name: 'reversi', newGame, onTap, draw, resize, undo, status, stop, roll: () => {}, _t };
})();
