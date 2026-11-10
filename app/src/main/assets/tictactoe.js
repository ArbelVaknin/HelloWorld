'use strict';
// Tic-tac-toe (איקס מיקס דריקס) with faces instead of X / O.
// 'b' = the black-side player, 'w' = the white-side player. Starter alternates each game.

const TicTacToe = (() => {
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const POP_MS = 220, LINE_MS = 450;
  let G = null, geo = null;
  let nextStarter = 'b';

  function winner(b) {
    for (const l of LINES) {
      const [a, c, d] = l;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { color: b[a], line: l };
    }
    return null;
  }
  const full = b => b.every(Boolean);

  // ---------- computer ----------
  function minimax(b, turn, me) {
    const w = winner(b);
    if (w) return w.color === me ? 10 : -10;
    if (full(b)) return 0;
    let best = turn === me ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = turn;
      const v = minimax(b, opp(turn), me) * 0.9; // prefer quicker wins
      b[i] = null;
      best = turn === me ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }

  function chooseCell() {
    const free = [];
    for (let i = 0; i < 9; i++) if (!G.board[i]) free.push(i);
    const smart = S.level === 'hard' ? 1 : S.level === 'mid' ? 0.7 : 0.3;
    if (Math.random() > smart) return free[Math.floor(Math.random() * free.length)];
    let best = [], bv = -Infinity;
    for (const i of free) {
      G.board[i] = G.turn;
      const v = minimax(G.board, opp(G.turn), G.turn);
      G.board[i] = null;
      if (v > bv) { bv = v; best = [i]; } else if (v === bv) best.push(i);
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  // ---------- game flow ----------
  function newGame() {
    G = { board: Array(9).fill(null), turn: nextStarter, hist: [], placed: {}, win: null, over: false, busy: false, msg: '', t0: 0 };
    nextStarter = opp(nextStarter);
    startTurn();
  }

  function startTurn() {
    G.msg = '';
    if (isCpu(G.turn) && !G.over) {
      G.busy = true; G.msg = 'המחשב חושב…';
      const g = G;
      setTimeout(() => { if (G === g) place(chooseCell()); }, 550);
    }
    App.update();
  }

  function place(i) {
    G.hist.push({ board: G.board.slice(), turn: G.turn });
    G.board[i] = G.turn;
    G.placed[i] = performance.now();
    G.busy = false;
    const w = winner(G.board);
    if (w) {
      G.win = w; G.over = true; G.t0 = performance.now();
      App.update();
      const g = G;
      setTimeout(() => { if (G === g) App.showWin(w.color); }, LINE_MS + 500);
      return;
    }
    if (full(G.board)) {
      G.over = true;
      App.update();
      const g = G;
      setTimeout(() => { if (G === g) App.showWin(null); }, 600);
      return;
    }
    G.turn = opp(G.turn);
    startTurn();
  }

  function onTap(x, y) {
    if (!G || G.busy || G.over || isCpu(G.turn)) return;
    const { ox, oy, sq } = geo;
    const c = Math.floor((x - ox) / sq), r = Math.floor((y - oy) / sq);
    if (r < 0 || r > 2 || c < 0 || c > 2) return;
    const i = r * 3 + c;
    if (G.board[i]) return;
    place(i);
  }

  function undo() {
    if (!G || G.busy || !G.hist.length) return;
    let h = G.hist.pop();
    if (S.opponent === 'cpu') {
      while (isCpu(h.turn) && G.hist.length) h = G.hist.pop();
      if (isCpu(h.turn)) { G.hist.push(h); return; }
    }
    G.board = h.board; G.turn = h.turn; G.win = null; G.over = false;
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
    const bs = Math.floor(Math.min(W, H) - 24);
    geo = { W, H, bs, sq: bs / 3, ox: (W - bs) / 2, oy: (H - bs) / 2 };
  }
  const center = i => [geo.ox + (i % 3 + 0.5) * geo.sq, geo.oy + (Math.floor(i / 3) + 0.5) * geo.sq];

  function draw(ctx) {
    if (!G || !geo) return false;
    const { ox, oy, sq, bs } = geo;
    const now = performance.now();
    let animating = false;

    ctx.fillStyle = '#2a1f17';
    roundRect(ctx, ox - 8, oy - 8, bs + 16, bs + 16, 18); ctx.fill();
    // grid
    ctx.strokeStyle = '#c9822b'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(4, sq * 0.05);
    for (let k = 1; k < 3; k++) {
      ctx.beginPath(); ctx.moveTo(ox + k * sq, oy + sq * 0.08); ctx.lineTo(ox + k * sq, oy + bs - sq * 0.08); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + sq * 0.08, oy + k * sq); ctx.lineTo(ox + bs - sq * 0.08, oy + k * sq); ctx.stroke();
    }

    for (let i = 0; i < 9; i++) {
      const c = G.board[i];
      if (!c) continue;
      const [x, y] = center(i);
      const t = Math.min(1, (now - (G.placed[i] || 0)) / POP_MS);
      if (t < 1) animating = true;
      const s = t < 1 ? 0.4 + 0.75 * ease(t) - 0.15 * Math.sin(Math.PI * t) : 1;
      const dim = G.win && !G.win.line.includes(i) ? 0.35 : 1;
      ctx.save(); ctx.globalAlpha = dim;
      drawFacePiece(ctx, c, x, y, sq * 0.4 * s, 0.86);
      ctx.restore();
    }

    if (G.win) {
      const t = Math.min(1, (now - G.t0) / LINE_MS);
      if (t < 1) animating = true;
      const [a, b] = [center(G.win.line[0]), center(G.win.line[2])];
      const ex = a[0] - (b[0] - a[0]) * 0.18, ey = a[1] - (b[1] - a[1]) * 0.18;
      const fx = b[0] + (b[0] - a[0]) * 0.18, fy = b[1] + (b[1] - a[1]) * 0.18;
      ctx.strokeStyle = 'rgba(255, 207, 107, 0.9)'; ctx.lineWidth = sq * 0.1;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + (fx - ex) * ease(t), ey + (fy - ey) * ease(t)); ctx.stroke();
    }
    return animating;
  }

  function stop() { G = null; }

  const _t = { winner, minimax, get G() { return G; } };
  return { name: 'tictactoe', newGame, onTap, draw, resize, undo, status, stop, roll: () => {}, _t };
})();
