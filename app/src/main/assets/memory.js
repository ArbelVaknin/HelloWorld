'use strict';
// Memory (משחק זיכרון): find matching pairs. Cards are the players' photos plus fun emoji.
// A match scores a point and the same player goes again.

const Memory = (() => {
  const COLS = 6, ROWS = 4, PAIRS = COLS * ROWS / 2;
  const FLIP_MS = 260;
  const EMOJI = ['🐶', '🐱', '🦁', '🐸', '🐵', '🦄', '🐙', '🦋', '🐢', '🍕', '🚀', '⚽', '🌈', '🍦', '🐬', '🦖', '🐧', '🍉', '🎈', '🐝'];
  let G = null, geo = null, nextStarter = 'b';
  const imgCache = {};

  function makeDeck() {
    const players = shuffle(allPlayers().slice()).slice(0, 4);
    const kinds = players.map(p => ({ kind: 'img', val: p.img }));
    for (const e of shuffle(EMOJI.slice())) { if (kinds.length >= PAIRS) break; kinds.push({ kind: 'emoji', val: e }); }
    const cards = [];
    kinds.forEach((k, key) => {
      if (k.kind === 'img' && !imgCache[k.val]) { const im = new Image(); im.onload = () => App.requestDraw(); im.src = k.val; imgCache[k.val] = im; }
      for (let j = 0; j < 2; j++) cards.push({ key, kind: k.kind, val: k.val, up: false, by: null, t: 0 });
    });
    return shuffle(cards);
  }

  function newGame() {
    G = { cards: makeDeck(), turn: nextStarter, open: [], score: { b: 0, w: 0 }, busy: false, over: false, msg: '', mem: {} };
    nextStarter = opp(nextStarter);
    startTurn();
  }

  // the computer "remembers" each revealed card with a chance that depends on the level
  function remember(i) {
    const p = S.level === 'easy' ? 0.25 : S.level === 'mid' ? 0.6 : 0.95;
    if (Math.random() < p) G.mem[i] = G.cards[i].key;
  }

  function startTurn() {
    G.msg = '';
    if (isCpu(G.turn) && !G.over) { G.busy = true; G.msg = 'המחשב חושב…'; cpuPick(); }
    App.update();
  }

  function later(fn, ms) { const g = G; setTimeout(() => { if (G === g) fn(); }, ms); }

  function cpuPick() {
    const free = G.cards.map((c, i) => i).filter(i => !G.cards[i].by && !G.cards[i].up);
    const known = free.filter(i => i in G.mem);
    let first = null, second = null;
    // a known pair?
    for (const i of known) for (const j of known) if (i < j && G.mem[i] === G.mem[j]) { first = i; second = j; }
    if (first === null) {
      const unknown = free.filter(i => !(i in G.mem));
      first = (unknown.length ? unknown : free)[Math.floor(Math.random() * (unknown.length || free.length))];
    }
    later(() => {
      flip(first, true);
      later(() => {
        if (second === null) {
          const key = G.cards[first].key;
          const match = free.find(i => i !== first && G.mem[i] === key);
          if (match !== undefined) second = match;
          else {
            const unknown = free.filter(i => i !== first && !(i in G.mem));
            const pool = unknown.length ? unknown : free.filter(i => i !== first);
            second = pool[Math.floor(Math.random() * pool.length)];
          }
        }
        flip(second, true);
      }, 750);
    }, 500);
  }

  function flip(i, cpu) {
    const c = G.cards[i];
    c.up = true; c.t = performance.now();
    G.open.push(i);
    remember(i);
    if (G.open.length === 2) {
      G.busy = true;
      const [a, b] = G.open;
      const match = G.cards[a].key === G.cards[b].key;
      later(() => {
        if (match) {
          G.cards[a].by = G.cards[b].by = G.turn;
          delete G.mem[a]; delete G.mem[b];
          G.score[G.turn]++;
          G.open = [];
          G.busy = false;
          if (G.cards.every(x => x.by)) return finish();
          G.msg = 'יש זוג! 🎉 עוד תור';
          if (isCpu(G.turn)) startTurn(); else App.update();
        } else {
          for (const k of G.open) { G.cards[k].up = false; G.cards[k].t = performance.now(); }
          G.open = [];
          G.busy = false;
          G.turn = opp(G.turn);
          startTurn();
        }
      }, match ? 650 : 1100);
    } else if (!cpu) G.msg = '';
    App.update();
  }

  function finish() {
    G.over = true;
    App.update();
    const { b, w } = G.score;
    later(() => App.showWin(b === w ? null : b > w ? 'b' : 'w', '', `${NAMES.b} ${b} : ${w} ${NAMES.w}`), 500);
  }

  function onTap(x, y) {
    if (!G || G.busy || G.over || isCpu(G.turn)) return;
    const c = Math.floor((x - geo.ox) / geo.cw), r = Math.floor((y - geo.oy) / geo.ch);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
    const i = r * COLS + c;
    const card = G.cards[i];
    if (card.up || card.by) return;
    flip(i, false);
  }

  function status() {
    if (!G) return null;
    const sc = `${NAMES.b}: ${G.score.b} · ${NAMES.w}: ${G.score.w}`;
    return { turn: G.turn, text: 'התור של ' + NAMES[G.turn] + (isCpu(G.turn) ? '\n(המחשב)' : ''), msg: (G.msg ? G.msg + '\n' : '') + sc, roll: null, canUndo: false };
  }

  // ---------- drawing ----------
  function resize(W, H) {
    const gap = 6;
    const cw = Math.min((W - 12) / COLS, (H - 12) / ROWS * 0.85);
    const ch = cw / 0.85;
    geo = { W, H, gap, cw, ch, ox: (W - cw * COLS) / 2, oy: (H - ch * ROWS) / 2 };
  }

  function draw(ctx) {
    if (!G || !geo) return false;
    const { cw, ch, ox, oy, gap } = geo;
    const now = performance.now();
    let animating = false;
    G.cards.forEach((card, i) => {
      const x = ox + (i % COLS) * cw + gap / 2, y = oy + Math.floor(i / COLS) * ch + gap / 2;
      const w = cw - gap, h = ch - gap;
      // flip animation: shrink to 0 width, swap side, grow back
      const t = Math.min(1, (now - card.t) / FLIP_MS);
      if (t < 1) animating = true;
      const showFront = t < 0.5 ? !card.up : card.up;
      const sx = Math.abs(Math.cos(Math.PI * t)) || 0.01;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(card.t ? sx : 1, 1);
      ctx.translate(-w / 2, -h / 2);
      const front = card.t ? showFront : false;
      if (!front) {
        roundRect(ctx, 0, 0, w, h, 8);
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#c9822b'); g.addColorStop(1, '#8a4f17');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = '#f0b55c'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = `bold ${Math.round(h * 0.4)}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', w / 2, h / 2 + 2);
      } else {
        if (card.by) ctx.globalAlpha = 0.55;
        roundRect(ctx, 0, 0, w, h, 8);
        ctx.fillStyle = '#fbf6ea'; ctx.fill();
        ctx.lineWidth = card.by ? 4 : 2;
        ctx.strokeStyle = card.by ? (card.by === 'b' ? '#111' : '#f4f1ea') : '#c9822b';
        ctx.stroke();
        if (card.kind === 'emoji') {
          ctx.font = `${Math.round(Math.min(w, h) * 0.62)}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(card.val, w / 2, h / 2 + 2);
        } else {
          const im = imgCache[card.val];
          const r = Math.min(w, h) * 0.42;
          if (im && im.complete && im.naturalWidth) {
            ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(im, w / 2 - r, h / 2 - r, r * 2, r * 2); ctx.restore();
          }
        }
        // small face of who found the pair
        if (card.by) {
          ctx.globalAlpha = 1;
          drawFacePiece(ctx, card.by, w - 12, 12, 11, 0.8);
        }
      }
      ctx.restore();
    });
    return animating;
  }

  function stop() { G = null; }
  const _t = { get G() { return G; } };
  return { name: 'memory', newGame, onTap, draw, resize, undo: () => {}, status, stop, roll: () => {}, _t };
})();
