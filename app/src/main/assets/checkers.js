'use strict';
// Checkers (דמקה). Black (Emma) starts at the top and moves down; white (Dad) at the bottom moves up.
// A man that reaches the far row becomes a king and shows the player's face.

const Checkers = (() => {
  const N = 8;
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const SEG_MS = 170;
  let G = null;
  let geo = null;

  const inb = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
  const fwd = c => (c === 'w' ? -1 : 1);
  const promoRow = c => (c === 'w' ? 0 : N - 1);
  const rules = () => ({ force: !!S.ck_force, back: !!S.ck_back, fly: !!S.ck_fly });

  function initBoard() {
    const b = [];
    for (let r = 0; r < N; r++) {
      const row = [];
      for (let c = 0; c < N; c++) {
        let p = null;
        if ((r + c) % 2 === 1) {
          if (r < 3) p = { c: 'b', k: false };
          else if (r > 4) p = { c: 'w', k: false };
        }
        row.push(p);
      }
      b.push(row);
    }
    return b;
  }
  const clone = b => b.map(row => row.map(p => (p ? { c: p.c, k: p.k } : null)));

  // ---------- rules engine ----------
  function capturesFrom(b, r, c, p, R, path, caps, out) {
    const before = out.length;
    const isCap = (rr, cc) => caps.some(([a, d]) => a === rr && d === cc);
    const jump = (lr, lc, mr, mc) => {
      const np = path.concat([[lr, lc]]);
      const nc = caps.concat([[mr, mc]]);
      if (!p.k && lr === promoRow(p.c)) { out.push({ path: np, caps: nc }); return; } // promotion ends the move
      b[r][c] = null; b[lr][lc] = p;
      const n0 = out.length;
      capturesFrom(b, lr, lc, p, R, np, nc, out);
      b[lr][lc] = null; b[r][c] = p;
      if (out.length === n0) out.push({ path: np, caps: nc });
    };
    for (const [dr, dc] of DIRS) {
      if (!p.k && !R.back && dr !== fwd(p.c)) continue;
      if (p.k && R.fly) {
        let rr = r + dr, cc = c + dc;
        while (inb(rr, cc) && !b[rr][cc]) { rr += dr; cc += dc; }
        if (!inb(rr, cc)) continue;
        const q = b[rr][cc];
        if (q.c === p.c || isCap(rr, cc)) continue;
        let lr = rr + dr, lc = cc + dc;
        while (inb(lr, lc) && !b[lr][lc]) { jump(lr, lc, rr, cc); lr += dr; lc += dc; }
      } else {
        const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
        if (!inb(lr, lc)) continue;
        const q = b[mr][mc];
        if (!q || q.c === p.c || isCap(mr, mc) || b[lr][lc]) continue;
        jump(lr, lc, mr, mc);
      }
    }
    return out.length > before;
  }

  function genMoves(b, color, R) {
    const caps = [], simple = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const p = b[r][c];
      if (!p || p.c !== color) continue;
      capturesFrom(b, r, c, p, R, [[r, c]], [], caps);
      for (const [dr, dc] of DIRS) {
        if (!p.k && dr !== fwd(p.c)) continue;
        let rr = r + dr, cc = c + dc;
        while (inb(rr, cc) && !b[rr][cc]) {
          simple.push({ path: [[r, c], [rr, cc]], caps: [] });
          if (!(p.k && R.fly)) break;
          rr += dr; cc += dc;
        }
      }
    }
    if (caps.length && R.force) return caps;
    return caps.concat(simple);
  }

  function applyMove(b, m) {
    const [r0, c0] = m.path[0];
    const [r1, c1] = m.path[m.path.length - 1];
    const p = b[r0][c0];
    b[r0][c0] = null;
    for (const [r, c] of m.caps) b[r][c] = null;
    b[r1][c1] = p;
    if (!p.k && r1 === promoRow(p.c)) p.k = true;
  }

  // ---------- computer player ----------
  const ABORT = {};
  let deadline = 0, nodes = 0;

  function evaluate(b, color) {
    let s = 0;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const p = b[r][c];
      if (!p) continue;
      let v = p.k ? 300 : 100 + (p.c === 'w' ? 7 - r : r) * 4;
      if (c >= 2 && c <= 5 && r >= 2 && r <= 5) v += 4;
      if (!p.k && r === (p.c === 'w' ? 7 : 0)) v += 6; // keep the back row
      s += p.c === color ? v : -v;
    }
    return s;
  }

  function negamax(b, color, depth, alpha, beta, R) {
    if ((++nodes & 511) === 0 && performance.now() > deadline) throw ABORT;
    const moves = genMoves(b, color, R);
    if (!moves.length) return -100000 - depth;
    if (depth <= 0) return evaluate(b, color);
    let best = -Infinity;
    for (const m of moves) {
      const nb = clone(b); applyMove(nb, m);
      const v = -negamax(nb, opp(color), depth - 1, -beta, -alpha, R);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  function chooseMove() {
    const R = rules();
    const moves = shuffle(G.legal.slice());
    if (moves.length === 1) return moves[0];
    if (S.level === 'easy') {
      let best = null, bv = -Infinity;
      for (const m of moves) {
        const nb = clone(G.board); applyMove(nb, m);
        const v = evaluate(nb, G.turn) + Math.random() * 160;
        if (v > bv) { bv = v; best = m; }
      }
      return best;
    }
    const maxDepth = S.level === 'mid' ? 3 : 10;
    deadline = performance.now() + (S.level === 'mid' ? 400 : 1500);
    nodes = 0;
    let chosen = moves[0];
    for (let d = 1; d <= maxDepth; d++) {
      try {
        let best = null, bv = -Infinity;
        for (const m of moves) {
          const nb = clone(G.board); applyMove(nb, m);
          const v = -negamax(nb, opp(G.turn), d - 1, -Infinity, -bv, R);
          if (v > bv) { bv = v; best = m; }
        }
        chosen = best;
        // search the best move first next iteration
        moves.splice(moves.indexOf(best), 1); moves.unshift(best);
        if (bv > 90000) break; // forced win found
      } catch (e) {
        if (e !== ABORT) throw e;
        break;
      }
    }
    return chosen;
  }

  // ---------- game flow ----------
  function newGame() {
    G = { board: initBoard(), turn: 'b', hist: [], partial: [], legal: [], over: false, anim: null, last: null, busy: false, msg: '' };
    startTurn();
  }

  function startTurn() {
    G.legal = genMoves(G.board, G.turn, rules());
    G.partial = [];
    G.msg = '';
    if (!G.legal.length) { G.over = true; App.update(); App.showWin(opp(G.turn)); return; }
    if (G.legal[0].caps.length && S.ck_force) G.msg = 'חובה לאכול!';
    if (isCpu(G.turn)) {
      G.busy = true; G.msg = 'המחשב חושב…';
      const g = G;
      setTimeout(() => {
        if (G !== g) return;
        const m = chooseMove();
        if (G !== g) return;
        G.msg = '';
        execute(m, 0);
      }, 450);
    }
    App.update();
  }

  // stepsShown = how many steps of the path are already displayed on the board
  function execute(m, stepsShown) {
    G.hist.push({ board: clone(G.board), turn: G.turn, last: G.last });
    const [r0, c0] = m.path[0];
    const p = G.board[r0][c0];
    G.anim = { m, p: { c: p.c, k: p.k }, k: stepsShown, t0: performance.now() };
    G.partial = [];
    G.busy = true;
    App.update();
  }

  function finishAnim() {
    const m = G.anim.m;
    G.anim = null;
    applyMove(G.board, m);
    G.last = m;
    G.turn = opp(G.turn);
    G.busy = false;
    startTurn();
  }

  function candidates() {
    const k = G.partial.length;
    return G.legal.filter(m => m.path.length > k - 1 &&
      G.partial.every(([r, c], i) => m.path[i][0] === r && m.path[i][1] === c));
  }

  function tryStep(r, c) {
    const k = G.partial.length;
    const next = candidates().filter(m => m.path.length > k && m.path[k][0] === r && m.path[k][1] === c);
    if (!next.length) return false;
    G.partial.push([r, c]);
    const full = next.find(m => m.path.length === G.partial.length);
    if (full) execute(full, G.partial.length - 2);
    return true;
  }

  function onTap(x, y) {
    if (!G || G.busy || G.over || isCpu(G.turn)) return;
    const { ox, oy, sq } = geo;
    const c = Math.floor((x - ox) / sq), r = Math.floor((y - oy) / sq);
    const k = G.partial.length;
    if (k > 1) { tryStep(r, c); return; } // in the middle of a multi-jump
    if (!inb(r, c)) { G.partial = []; return; }
    const p = G.board[r][c];
    if (p && p.c === G.turn) {
      if (G.legal.some(m => m.path[0][0] === r && m.path[0][1] === c)) G.partial = [[r, c]];
      else {
        G.partial = [];
        G.msg = G.legal[0].caps.length && S.ck_force ? 'חובה לאכול!\nבחר/י חייל שיכול לאכול' : 'לחייל הזה אין לאן לזוז';
      }
      return;
    }
    if (k === 1 && !tryStep(r, c)) G.partial = [];
  }

  function undo() {
    if (!G || G.busy || !G.hist.length) return;
    let h = G.hist.pop();
    if (S.opponent === 'cpu') {
      while (isCpu(h.turn) && G.hist.length) h = G.hist.pop();
      if (isCpu(h.turn)) { G.hist.push(h); return; }
    }
    G.board = h.board; G.turn = h.turn; G.last = h.last; G.over = false;
    App.hideWin();
    startTurn();
  }

  function canUndo() {
    if (!G || G.busy || !G.hist.length) return false;
    if (S.opponent === 'cpu') return G.hist.some(h => !isCpu(h.turn));
    return true;
  }

  function status() {
    if (!G) return null;
    let text = 'התור של ' + NAMES[G.turn];
    if (isCpu(G.turn)) text += '\n(המחשב)';
    return { turn: G.turn, text, msg: G.msg, roll: null, canUndo: canUndo() };
  }

  // ---------- drawing ----------
  function resize(W, H) {
    const bs = Math.floor(Math.min(W, H) - 12);
    const sq = bs / N;
    geo = { W, H, bs, sq, ox: (W - bs) / 2, oy: (H - bs) / 2 };
  }

  function center(r, c) { return [geo.ox + (c + 0.5) * geo.sq, geo.oy + (r + 0.5) * geo.sq]; }

  function drawPiece(ctx, p, x, y, alpha = 1) {
    const r = geo.sq * 0.42;
    ctx.save(); ctx.globalAlpha = alpha;
    if (p.k) {
      drawFacePiece(ctx, p.c, x, y, r, 0.84);
      glow(ctx, x, y, r * 0.84, '#e8b923', Math.max(2, r * 0.1));
      // gold crown on top
      const w = r * 0.8, h = r * 0.45, cy = y - r * 0.82;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, cy + h / 2);
      ctx.lineTo(x - w / 2, cy - h / 2);
      ctx.lineTo(x - w / 4, cy);
      ctx.lineTo(x, cy - h / 2 - h * 0.15);
      ctx.lineTo(x + w / 4, cy);
      ctx.lineTo(x + w / 2, cy - h / 2);
      ctx.lineTo(x + w / 2, cy + h / 2);
      ctx.closePath();
      ctx.fillStyle = '#f2c230'; ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.06); ctx.strokeStyle = '#8a6200'; ctx.stroke();
    } else {
      drawPlainPiece(ctx, p.c, x, y, r);
    }
    ctx.restore();
  }

  function draw(ctx) {
    if (!G || !geo) return false;
    const { ox, oy, sq, bs } = geo;
    // frame
    ctx.fillStyle = '#5a3a1f';
    roundRect(ctx, ox - 6, oy - 6, bs + 12, bs + 12, 8); ctx.fill();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#b07a4f' : '#f0d9b5';
      ctx.fillRect(ox + c * sq, oy + r * sq, sq + 0.5, sq + 0.5);
    }
    // last move
    if (G.last && !G.anim) {
      ctx.fillStyle = 'rgba(255, 220, 80, 0.28)';
      for (const [r, c] of [G.last.path[0], G.last.path[G.last.path.length - 1]]) ctx.fillRect(ox + c * sq, oy + r * sq, sq, sq);
    }

    const b = clone(G.board);
    const faded = [];
    let moving = null;
    let animating = false;

    if (G.anim) {
      const a = G.anim, path = a.m.path;
      const segs = path.length - 1 - a.k;
      const t = (performance.now() - a.t0) / SEG_MS;
      if (t >= segs) { finishAnim(); App.update(); return draw(ctx); }
      const s = Math.floor(t), f = ease(t - s);
      const [r0, c0] = path[0];
      b[r0][c0] = null;
      const capsDone = Math.min(a.k + s, a.m.caps.length);
      for (let i = 0; i < a.m.caps.length; i++) {
        const [r, c] = a.m.caps[i];
        if (i < capsDone) b[r][c] = null;
      }
      const [ax, ay] = center(...path[a.k + s]);
      const [bx, by] = center(...path[a.k + s + 1]);
      moving = { p: a.p, x: ax + (bx - ax) * f, y: ay + (by - ay) * f };
      animating = true;
    } else if (G.partial.length > 1) {
      const cand = candidates()[0];
      const [r0, c0] = G.partial[0];
      const p = b[r0][c0];
      b[r0][c0] = null;
      for (let i = 0; i < G.partial.length - 1; i++) {
        const [r, c] = cand.caps[i];
        faded.push({ p: b[r][c], r, c }); b[r][c] = null;
      }
      const [r1, c1] = G.partial[G.partial.length - 1];
      b[r1][c1] = p;
    }

    // hints for whose pieces can move (only for a human's turn)
    const human = !G.busy && !G.over && !isCpu(G.turn);
    if (human && G.partial.length === 0 && G.legal.length && G.legal[0].caps.length && S.ck_force) {
      const seen = new Set();
      for (const m of G.legal) {
        const key = m.path[0].join();
        if (seen.has(key)) continue; seen.add(key);
        const [x, y] = center(...m.path[0]);
        ctx.fillStyle = 'rgba(255, 140, 0, 0.45)';
        ctx.fillRect(x - sq / 2, y - sq / 2, sq, sq);
      }
    }

    for (const f of faded) { const [x, y] = center(f.r, f.c); drawPiece(ctx, f.p, x, y, 0.3); }
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!b[r][c]) continue;
      const [x, y] = center(r, c);
      drawPiece(ctx, b[r][c], x, y);
    }

    if (human && G.partial.length) {
      const [sr, sc] = G.partial[G.partial.length - 1];
      const [x, y] = center(sr, sc);
      glow(ctx, x, y, sq * 0.42, '#3fe07a', 4);
      const k = G.partial.length;
      for (const m of candidates()) {
        if (m.path.length <= k) continue;
        const [tx, ty] = center(...m.path[k]);
        ctx.beginPath(); ctx.arc(tx, ty, sq * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(63, 224, 122, 0.85)'; ctx.fill();
      }
    }

    if (moving) drawPiece(ctx, moving.p, moving.x, moving.y);
    return animating;
  }

  function stop() { G = null; }

  // exposed for tests
  const _t = { initBoard, genMoves, applyMove, get G() { return G; } };

  return { name: 'checkers', newGame, onTap, draw, resize, undo, status, stop, roll: () => {}, _t };
})();
