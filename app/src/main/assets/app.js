'use strict';

const App = (() => {
  const $ = id => document.getElementById(id);
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let game = null, W = 0, H = 0, raf = 0;

  function show(id) {
    for (const s of ['menu', 'game']) $(s).classList.toggle('hidden', s !== id);
  }

  // ---------- settings UI ----------
  function syncSettingsUI() {
    document.querySelectorAll('.seg').forEach(seg => {
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', S[seg.dataset.key] === b.dataset.val));
    });
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(i => { i.checked = !!S[i.dataset.key]; });
    document.querySelectorAll('.cpu-only').forEach(el => el.classList.toggle('hidden', S.opponent !== 'cpu'));
  }
  document.querySelectorAll('.seg').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      S[seg.dataset.key] = b.dataset.val; saveSettings(); syncSettingsUI();
    });
  });
  document.querySelectorAll('input[type=checkbox][data-key]').forEach(i => {
    i.addEventListener('change', () => { S[i.dataset.key] = i.checked; saveSettings(); });
  });

  // ---------- game screen ----------
  function resize() {
    const wrap = $('boardWrap');
    W = wrap.clientWidth; H = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (game) game.resize(W, H);
    requestDraw();
  }

  function requestDraw() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (!game) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (game.draw(ctx)) requestDraw();
    });
  }

  function update() {
    if (!game) return;
    const st = game.status();
    if (!st) return;
    const face = $('turnFace');
    if (st.turn) { face.src = IMG[st.turn].src; face.className = st.turn; face.style.visibility = 'visible'; }
    else face.style.visibility = 'hidden';
    $('turnText').textContent = st.text;
    $('msg').textContent = st.msg || '';
    const rb = $('btnRoll');
    rb.classList.toggle('hidden', !st.roll);
    if (st.roll) { rb.textContent = st.roll.label; rb.disabled = !st.roll.enabled; }
    $('btnUndo').disabled = !st.canUndo;
    requestDraw();
  }

  function start(g) {
    if (game) game.stop();
    game = g;
    hideWin();
    show('game');
    resize();
    game.newGame();
    update();
  }

  function toMenu() {
    if (game) game.stop();
    game = null;
    hideWin();
    syncSettingsUI();
    show('menu');
  }

  function showWin(color, extra) {
    const face = $('winFace');
    face.src = IMG[color].src; face.className = color;
    let t = color === 'b' ? 'אמה ניצחה! 🎉' : 'אבא ניצח! 🎉';
    if (isCpu(color)) t = (color === 'b' ? 'אמה (המחשב) ניצחה' : 'אבא (המחשב) ניצח') + ' 🤖';
    if (extra) t += '\n' + extra;
    $('winText').textContent = t;
    $('winText').style.whiteSpace = 'pre-line';
    $('overlay').classList.remove('hidden');
  }
  function hideWin() { $('overlay').classList.add('hidden'); }

  cv.addEventListener('pointerdown', e => {
    if (!game) return;
    const r = cv.getBoundingClientRect();
    game.onTap(e.clientX - r.left, e.clientY - r.top);
    update();
  });
  $('btnCheckers').onclick = () => start(Checkers);
  $('btnBackgammon').onclick = () => start(Backgammon);
  $('btnRoll').onclick = () => { if (game) { game.roll(); update(); } };
  $('btnUndo').onclick = () => { if (game) { game.undo(); update(); } };
  $('btnNew').onclick = () => { if (game) start(game); };
  $('btnMenu').onclick = toMenu;
  $('ovNew').onclick = () => { if (game) start(game); };
  $('ovMenu').onclick = toMenu;
  window.addEventListener('resize', resize);

  // Called by the Android back button. Returns true if handled.
  window.androidBack = () => {
    if (!$('overlay').classList.contains('hidden') || !$('game').classList.contains('hidden')) { toMenu(); return true; }
    return false;
  };

  syncSettingsUI();
  loadImages(() => requestDraw());

  return { update, showWin, hideWin, requestDraw, start, toMenu, get game() { return game; } };
})();
