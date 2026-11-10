'use strict';
// Five in a row (חמש בשורה) on a 13x13 grid. Tap once to preview, tap the same spot again to place.

const Gomoku = (() => {
  const N = 13;
  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const POP_MS = 200;
  let G = null, geo = null, nextStarter = 'b';

  const inb = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

  function winLine(b, i) {
    const col = b[i]; if (!col) return null;
    const r = Math.floor(i / N), c = i % N;
    for (const [dr, dc] of DIRS) {
      const cells = [i];
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (inb(rr, cc) && b[rr * N + cc] === col) { cells.push(rr * N + cc); rr += dr * s; cc += dc * s; }
      }
      if (cells.length >= 5) return cells;
    }
    return null;
  }

  // ---------- computer: score each empty spot near the stones ----------
  // value of a line through i if `color` played there: by run length and open ends
  function lineScore(b, i, color) {
    const r = Math.floor(i / N), c = i % N;
    let total = 0;
    for (const [dr, dc] of DIRS) {
      let run = 1, open = 0;
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (inb(rr, cc) && b[rr * N + cc] === color) { run++; rr += dr * s; cc += dc * s; }
        if (inb(rr, cc) && !b[rr * N + cc]) open++;
      }
      if (run >= 5) total += 1e6;
      else if (run === 4) total += open === 2 ? 1e5 : open === 1 ? 1e4 : 0;
      else if (run === 3) total += open === 2 ? 5000 : open === 1 ? 300 : 0;
      else if (run === 2) total += open === 2 ? 200 : open === 1 ? 30 : 0;
      else total += open * 2;
    }
    return total;
  }

  function chooseCell() {
    const b = G.board, me = G.turn, op = opp(me);
    if (b.every(v => !v)) return Math.floor(N / 2) * N + Math.floor(N / 2);
    const cand = [];
    for (let i = 0; i < N * N; i++) {
      if (b[i]) continue;
      const r = Math.floor(i / N), c = i % N;
      let near = false;
      for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2; dc++) {
        if (inb(r + dr, c + dc) && b[(r + dr) * N + c + dc]) { near = true; break; }
      }
      if (near) cand.push(i);
    }
    const noise = S.level === 'easy' ? 600 : S.level === 'mid' ? 60 : 0;
    const defend = S.level === 'easy' ? 0.5 : 0.95;
    let best = cand[0], bv = -Infinity;
    for (const i of cand) {
      let v = lineScore(b, i, me) + lineScore(b, i, op) * defend + Math.random() * (noise + 1);
      if (S.level === 'easy' && lineScore(b, i, op) >= 1e4 && Math.random() < 0.4) v -= 1e4; // sometimes misses a block
      if (v > bv) { bv = v; best = i; }
    }
    return best;
  }

  // ---------- game flow ----------
  function newGame() {
    G = { board: Array(N * N).fill(null), turn: nextStarter, hist: [], ghost: -1, placed: {}, last: -1, win: null, over: false, busy: false, msg: '' };
    nextStarter = opp(nextStarter);
    startTurn();
  }

  function startTurn() {
    G.msg = isCpu(G.turn) ? '' : 'הקש/י על נקודה, ושוב כדי לשים';
    if (isCpu(G.turn) && !G.over) {
      G.busy = true; G.msg = 'המחשב חושב…';
      const g = G;
      setTimeout(() => { if (G === g) place(chooseCell()); }, 500);
    }
    App.update();
  }

  function place(i) {
    G.hist.push({ board: G.board.slice(), turn: G.turn, last: G.last });
    G.board[i] = G.turn;
    G.placed[i] = performance.now();
    G.last = i; G.ghost = -1; G.busy = false;
    const w = winLine(G.board, i);
    if (w) {
      G.win = w; G.over = true; G.msg = ''; App.update();
      const g = G; setTimeout(() => { if (G === g) App.showWin(G.board[i]); }, 900);
      return;
    }
    if (G.board.every(Boolean)) {
      G.over = true; App.update();
      const g = G; setTimeout(() => { if (G === g) App.showWin(null); }, 600);
      return;
    }
    G.turn = opp(G.turn);
    startTurn();
  }

  function onTap(x, y) {
    if (!G || G.busy || G.over || isCpu(G.turn)) return;
    const c = Math.round((x - geo.ox) / geo.cs), r = Math.round((y - geo.oy) / geo.cs);
    if (!inb(r, c)) { G.ghost = -1; return; }
    const i = r * N + c;
    if (G.board[i]) return;
    if (G.ghost === i) place(i);
    else G.ghost = i;
  }

  function undo() {
    if (!G || G.busy || !G.hist.length) return;
    let h = G.hist.pop();
    if (S.opponent === 'cpu') {
      while (isCpu(h.turn) && G.hist.length) h = G.hist.pop();
      if (isCpu(h.turn)) { G.hist.push(h); return; }
    }
    G.board = h.board; G.turn = h.turn; G.last = h.last; G.win = null; G.over = false; G.ghost = -1;
    App.hideWin();
    startTurn();
  }
  function canUndo() {
    if (!G || G.busy || !G.hist.length) return false;
    return S.opponent === 'cpu' ? G.hist.some(h => !isCpu(h.turn)) : true;
  }

  function status() {
    if (!G) return null;
    return { turn: G.turn, text: 'התור של ' + NAMES[G.turn] + (isCpu(G.turn) ? '\n(המחשב)' : ''), msg: G.msg, roll: null, canUndo: canUndo() };
  }

  // ---------- drawing ----------
  function resize(W, H) {
    const cs = Math.floor((Math.min(W, H) - 24) / (N - 1));
    const span = cs * (N - 1);
    geo = { W, H, cs, span, ox: (W - span) / 2, oy: (H - span) / 2 };
  }

  function draw(ctx) {
    if (!G || !geo) return false;
    const { ox, oy, cs, span } = geo;
    const now = performance.now();
    let animating = false;
    ctx.fillStyle = '#d9a95f';
    roundRect(ctx, ox - cs * 0.7, oy - cs * 0.7, span + cs * 1.4, span + cs * 1.4, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(70, 40, 10, 0.7)'; ctx.lineWidth = 1;
    for (let k = 0; k < N; k++) {
      ctx.beginPath(); ctx.moveTo(ox + k * cs, oy); ctx.lineTo(ox + k * cs, oy + span); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, oy + k * cs); ctx.lineTo(ox + span, oy + k * cs); ctx.stroke();
    }
    for (const [r, c] of [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]]) {
      ctx.beginPath(); ctx.arc(ox + c * cs, oy + r * cs, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(70,40,10,0.8)'; ctx.fill();
    }
    const pr = cs * 0.47;
    for (let i = 0; i < N * N; i++) {
      const v = G.board[i]; if (!v) continue;
      const x = ox + (i % N) * cs, y = oy + Math.floor(i / N) * cs;
      const t = Math.min(1, (now - (G.placed[i] || 0)) / POP_MS);
      if (t < 1) animating = true;
      ctx.save(); if (G.win && !G.win.includes(i)) ctx.globalAlpha = 0.4;
      drawFacePiece(ctx, v, x, y, pr * (t < 1 ? 0.5 + 0.5 * ease(t) : 1), 0.86);
      ctx.restore();
      if (i === G.last && !G.win) glow(ctx, x, y, pr, '#ff7a3d', 2.5);
    }
    if (G.win) for (const i of G.win) glow(ctx, ox + (i % N) * cs, oy + Math.floor(i / N) * cs, pr, '#ffcf6b', 3);
    if (G.ghost >= 0) {
      const x = ox + (G.ghost % N) * cs, y = oy + Math.floor(G.ghost / N) * cs;
      ctx.save(); ctx.globalAlpha = 0.55; drawFacePiece(ctx, G.turn, x, y, pr, 0.86); ctx.restore();
      glow(ctx, x, y, pr, '#3fe07a', 3);
    }
    return animating;
  }

  function stop() { G = null; }
  const _t = { winLine, chooseCell, N, get G() { return G; } };
  return { name: 'gomoku', newGame, onTap, draw, resize, undo, status, stop, roll: () => {}, _t };
})();
