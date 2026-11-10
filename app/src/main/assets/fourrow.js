'use strict';
// Four in a row (ארבע בשורה): drop face-discs into 7 columns; four in a line wins.

const FourRow = (() => {
  const C = 7, R = 6;
  const DROP_MS = 60; // per row
  let G = null, geo = null, nextStarter = 'b';

  // all 4-cell windows, for the evaluation
  const WINDOWS = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const w = [];
      for (let k = 0; k < 4; k++) {
        const rr = r + dr * k, cc = c + dc * k;
        if (rr < 0 || rr >= R || cc < 0 || cc >= C) break;
        w.push(rr * C + cc);
      }
      if (w.length === 4) WINDOWS.push(w);
    }
  }
  const ORDER = [3, 2, 4, 1, 5, 0, 6];

  function lowest(b, c) { for (let r = R - 1; r >= 0; r--) if (!b[r * C + c]) return r; return -1; }

  function winLine(b, i) {
    const col = b[i]; if (!col) return null;
    const r = Math.floor(i / C), c = i % C;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const cells = [i];
      for (const s of [1, -1]) {
        let rr = r + dr * s, cc = c + dc * s;
        while (rr >= 0 && rr < R && cc >= 0 && cc < C && b[rr * C + cc] === col) { cells.push(rr * C + cc); rr += dr * s; cc += dc * s; }
      }
      if (cells.length >= 4) return cells;
    }
    return null;
  }

  // ---------- computer ----------
  const ABORT = {};
  let deadline = 0, nodes = 0;

  function evaluate(b, me) {
    const op = opp(me);
    let s = 0;
    for (let r = 0; r < R; r++) { const v = b[r * C + 3]; if (v === me) s += 3; else if (v === op) s -= 3; }
    for (const w of WINDOWS) {
      let m = 0, o = 0;
      for (const i of w) { if (b[i] === me) m++; else if (b[i] === op) o++; }
      if (m && o) continue;
      if (m === 3) s += 6; else if (m === 2) s += 2;
      if (o === 3) s -= 7; else if (o === 2) s -= 2;
    }
    return s;
  }

  function negamax(b, turn, depth, alpha, beta, last) {
    if ((++nodes & 1023) === 0 && performance.now() > deadline) throw ABORT;
    if (last >= 0 && winLine(b, last)) return -(10000 + depth); // previous mover won
    if (depth === 0) return evaluate(b, turn);
    let best = -Infinity, any = false;
    for (const c of ORDER) {
      const r = lowest(b, c); if (r < 0) continue;
      any = true;
      const i = r * C + c;
      b[i] = turn;
      const v = -negamax(b, opp(turn), depth - 1, -beta, -alpha, i);
      b[i] = null;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return any ? best : 0; // full board: draw
  }

  function chooseColumn() {
    const b = G.board.slice(), me = G.turn;
    const cols = ORDER.filter(c => lowest(b, c) >= 0);
    if (S.level === 'easy' && Math.random() < 0.3) return cols[Math.floor(Math.random() * cols.length)];
    const maxD = S.level === 'easy' ? 2 : S.level === 'mid' ? 4 : 12;
    deadline = performance.now() + (S.level === 'hard' ? 1200 : 400);
    nodes = 0;
    let chosen = cols[0];
    for (let d = 1; d <= maxD; d++) {
      try {
        let best = [], bv = -Infinity;
        for (const c of cols) {
          const i = lowest(b, c) * C + c;
          b[i] = me;
          let v = -negamax(b, opp(me), d - 1, -Infinity, Infinity, i);
          b[i] = null;
          if (S.level === 'easy') v += Math.random() * 12;
          if (v > bv) { bv = v; best = [c]; } else if (v === bv) best.push(c);
        }
        chosen = best[Math.floor(Math.random() * best.length)];
        if (bv > 9000) break;
      } catch (e) { if (e !== ABORT) throw e; break; }
    }
    return chosen;
  }

  // ---------- game flow ----------
  function newGame() {
    G = { board: Array(R * C).fill(null), turn: nextStarter, hist: [], anim: null, win: null, over: false, busy: false, msg: '' };
    nextStarter = opp(nextStarter);
    startTurn();
  }

  function startTurn() {
    G.msg = '';
    if (isCpu(G.turn) && !G.over) {
      G.busy = true; G.msg = 'המחשב חושב…';
      const g = G;
      setTimeout(() => { if (G === g) drop(chooseColumn()); }, 450);
    }
    App.update();
  }

  function drop(c) {
    const r = lowest(G.board, c); if (r < 0) return;
    G.hist.push({ board: G.board.slice(), turn: G.turn });
    G.busy = true; G.msg = '';
    G.anim = { c, r, color: G.turn, t0: performance.now() };
    App.update();
  }

  function land() {
    const { r, c, color } = G.anim;
    G.anim = null;
    const i = r * C + c;
    G.board[i] = color;
    G.busy = false;
    const w = winLine(G.board, i);
    if (w) {
      G.win = w; G.over = true; App.update();
      const g = G; setTimeout(() => { if (G === g) App.showWin(color); }, 900);
      return;
    }
    if (G.board.every(Boolean)) {
      G.over = true; App.update();
      const g = G; setTimeout(() => { if (G === g) App.showWin(null); }, 700);
      return;
    }
    G.turn = opp(G.turn);
    startTurn();
  }

  function onTap(x) {
    if (!G || G.busy || G.over || isCpu(G.turn)) return;
    const c = Math.floor((x - geo.ox) / geo.cs);
    if (c < 0 || c >= C) return;
    if (lowest(G.board, c) < 0) { G.msg = 'העמודה מלאה'; return; }
    drop(c);
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
    return S.opponent === 'cpu' ? G.hist.some(h => !isCpu(h.turn)) : true;
  }

  function status() {
    if (!G) return null;
    return { turn: G.turn, text: 'התור של ' + NAMES[G.turn] + (isCpu(G.turn) ? '\n(המחשב)' : ''), msg: G.msg, roll: null, canUndo: canUndo() };
  }

  // ---------- drawing ----------
  function resize(W, H) {
    const cs = Math.floor(Math.min((W - 20) / C, (H - 20) / R));
    geo = { W, H, cs, bw: cs * C, bh: cs * R, ox: (W - cs * C) / 2, oy: (H - cs * R) / 2 };
  }
  const cellXY = (r, c) => [geo.ox + (c + 0.5) * geo.cs, geo.oy + (r + 0.5) * geo.cs];

  function draw(ctx) {
    if (!G || !geo) return false;
    const { ox, oy, cs, bw, bh } = geo;
    let animating = false;
    const pr = cs * 0.42;

    // pieces behind the board face
    for (let i = 0; i < R * C; i++) {
      if (!G.board[i]) continue;
      const [x, y] = cellXY(Math.floor(i / C), i % C);
      ctx.save(); if (G.win && !G.win.includes(i)) ctx.globalAlpha = 0.35;
      drawFacePiece(ctx, G.board[i], x, y, pr, 0.86);
      ctx.restore();
    }
    if (G.anim) {
      const a = G.anim;
      const total = (a.r + 1) * DROP_MS;
      const t = Math.min(1, (performance.now() - a.t0) / total);
      const [x, y1] = cellXY(a.r, a.c);
      const y0 = oy - cs * 0.5;
      const y = y0 + (y1 - y0) * t * t;
      drawFacePiece(ctx, a.color, x, y, pr, 0.86);
      if (t >= 1) { land(); App.update(); }
      animating = true;
    }

    // board with holes
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, ox - 8, oy - 4, bw + 16, bh + 12, 14);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const [x, y] = cellXY(r, c);
      ctx.moveTo(x + cs * 0.44, y);
      ctx.arc(x, y, cs * 0.44, 0, Math.PI * 2, true);
    }
    ctx.fillStyle = '#2f5aa8';
    ctx.fill('evenodd');
    ctx.restore();
    // hole rims
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const [x, y] = cellXY(r, c);
      ctx.beginPath(); ctx.arc(x, y, cs * 0.44, 0, Math.PI * 2); ctx.stroke();
    }
    if (G.win) for (const i of G.win) {
      const [x, y] = cellXY(Math.floor(i / C), i % C);
      glow(ctx, x, y, cs * 0.44, '#ffcf6b', 4);
    }
    return animating;
  }

  function stop() { G = null; }
  const _t = { winLine, lowest, chooseColumn, get G() { return G; } };
  return { name: 'fourrow', newGame, onTap, draw, resize, undo, status, stop, roll: () => {}, _t };
})();
