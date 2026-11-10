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
    document.querySelectorAll('.seg[data-key]').forEach(seg => {
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', S[seg.dataset.key] === b.dataset.val));
    });
    document.querySelectorAll('input[type=checkbox][data-key]').forEach(i => { i.checked = !!S[i.dataset.key]; });
    document.querySelectorAll('.cpu-only').forEach(el => el.classList.toggle('hidden', S.opponent !== 'cpu'));
    $('myColorB').textContent = '⚫ שחור (' + NAMES.b + ')';
    $('myColorW').textContent = '⚪ לבן (' + NAMES.w + ')';
    renderPickers();
  }
  document.querySelectorAll('.seg[data-key]').forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      S[seg.dataset.key] = b.dataset.val; saveSettings(); syncSettingsUI();
    });
  });
  document.querySelectorAll('input[type=checkbox][data-key]').forEach(i => {
    i.addEventListener('change', () => { S[i.dataset.key] = i.checked; saveSettings(); });
  });

  // ---------- player pickers ----------
  function renderPickers() {
    document.querySelectorAll('.pick').forEach(box => {
      const side = box.dataset.side;
      const cur = side === 'b' ? S.pb : S.pw;
      box.innerHTML = '';
      for (const p of allPlayers()) {
        const chip = document.createElement('button');
        chip.className = 'chip' + (p.id === cur ? ' on' : '');
        const img = document.createElement('img'); img.src = p.img; img.alt = '';
        const name = document.createElement('span'); name.textContent = p.name;
        chip.append(img, name);
        chip.onclick = () => choosePlayer(side, p.id);
        const mic = document.createElement('span');
        mic.className = 'mic' + (LAUGHS[p.id] ? ' has' : '');
        mic.textContent = LAUGHS[p.id] ? '😂' : '🎤';
        mic.onclick = e => { e.stopPropagation(); LaughRecorder.open(p.id); };
        chip.append(mic);
        if (!p.builtin) {
          const del = document.createElement('span');
          del.className = 'del'; del.textContent = '✕';
          del.onclick = e => { e.stopPropagation(); askDelete(p); };
          chip.append(del);
        }
        box.append(chip);
      }
      const add = document.createElement('button');
      add.className = 'chip add'; add.textContent = '➕ חדש';
      add.onclick = () => AddPlayer.open(side);
      box.append(add);
    });
  }

  function choosePlayer(side, id) {
    const other = side === 'b' ? 'pw' : 'pb', mine = side === 'b' ? 'pb' : 'pw';
    if (S[other] === id) S[other] = S[mine]; // picked the other side's player: swap
    S[mine] = id;
    saveSettings();
    applyPlayers(() => syncSettingsUI());
    syncSettingsUI();
  }

  function askDelete(p) {
    confirmBox('למחוק את ' + p.name + '?', () => {
      CUSTOM_PLAYERS = CUSTOM_PLAYERS.filter(x => x.id !== p.id);
      saveCustomPlayers();
      delete LAUGHS[p.id]; saveLaughs();
      applyPlayers(() => syncSettingsUI());
      saveSettings();
      syncSettingsUI();
    });
  }

  function confirmBox(text, onYes) {
    $('confirmText').textContent = text;
    $('confirmDlg').classList.remove('hidden');
    $('confirmYes').onclick = () => { $('confirmDlg').classList.add('hidden'); onYes(); };
    $('confirmNo').onclick = () => $('confirmDlg').classList.add('hidden');
  }

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

  // ---------- win screen ----------
  const pick = a => a[Math.floor(Math.random() * a.length)];

  function showWin(color, kind) {
    const face = $('winFace');
    if (!color) { // draw (tic-tac-toe)
      face.style.display = 'none';
      $('winText').textContent = 'תיקו! 🤝';
      $('winTaunt').textContent = '';
      $('winTaunt').classList.add('hidden');
      $('overlay').classList.remove('hidden');
      return;
    }
    face.style.display = '';
    const L = opp(color);
    face.src = IMG[color].src; face.className = color;
    let t = NAMES[color] + ' ' + gx(color, 'ניצח', 'ניצחה') + '!';
    if (isCpu(color)) t = NAMES[color] + ' (המחשב) ' + gx(color, 'ניצח', 'ניצחה') + ' 🤖';
    let taunt = '';
    if (kind === 'mars') t += '\nמארס! (כפול) 🎉';
    else if (kind === 'turkish') {
      t += '\n🇹🇷 מארס טורקי! (פי 3) 🤣';
      taunt = pick([
        `חחחחח! ${NAMES[L]} ${gx(L, 'חטף', 'חטפה')} מארס טורקי!`,
        `${NAMES[L]}, ${gx(L, 'תביא', 'תביאי')} טישו 😂`,
        `${NAMES[L]} ${gx(L, 'נשאר תקוע', 'נשארה תקועה')} בבית של ${NAMES[color]}! 🤣`,
        `אוי ${NAMES[L]}... אולי ${gx(L, 'תנסה', 'תנסי')} דמקה? 😂`,
        `${NAMES[L]} ${gx(L, 'עוד מחפש', 'עוד מחפשת')} איפה הכלים 🙈`,
      ]);
      startLaugh(L, color);
    } else if (!kind) t += ' 🎉';
    $('winText').textContent = t;
    $('winText').style.whiteSpace = 'pre-line';
    $('winTaunt').textContent = taunt;
    $('winTaunt').classList.toggle('hidden', !taunt);
    $('overlay').classList.remove('hidden');
  }

  let hahaTimer = 0;
  function startLaugh(loser, winnerColor) {
    const layer = $('laughLayer');
    layer.innerHTML = '';
    layer.classList.remove('hidden');
    $('overlay').classList.add('turkish');
    // the loser's face rolls across the screen
    for (let i = 0; i < 2; i++) {
      const r = document.createElement('img');
      r.src = IMG[loser].src; r.className = 'roller ' + loser;
      r.style.animationDelay = (i * 1.6) + 's';
      if (i) { r.style.bottom = 'auto'; r.style.top = '10px'; r.style.animationDirection = 'reverse'; }
      layer.append(r);
    }
    // floating "חחחח"
    let n = 0;
    clearInterval(hahaTimer);
    hahaTimer = setInterval(() => {
      if (++n > 22) { clearInterval(hahaTimer); return; }
      const s = document.createElement('div');
      s.className = 'haha';
      s.textContent = pick(['חחחח', 'חחחחחח!', '😂', '🤣', 'הההה', 'חחח 🤣']);
      s.style.left = (5 + Math.random() * 85) + '%';
      s.style.top = (35 + Math.random() * 50) + '%';
      s.style.fontSize = (20 + Math.random() * 22) + 'px';
      s.style.setProperty('--r', (Math.random() * 40 - 20) + 'deg');
      layer.append(s);
      setTimeout(() => s.remove(), 2500);
    }, 250);
    Laugh.play(winnerColor === 'b' ? S.pb : S.pw);
  }

  function hideWin() {
    $('overlay').classList.add('hidden');
    $('overlay').classList.remove('turkish');
    $('laughLayer').classList.add('hidden');
    $('laughLayer').innerHTML = '';
    clearInterval(hahaTimer);
    Laugh.stop();
  }

  // ---------- events ----------
  // sound is only allowed after a touch, so unlock audio on the first one
  document.addEventListener('pointerdown', () => Laugh.unlock(), { capture: true });

  cv.addEventListener('pointerdown', e => {
    if (!game) return;
    const r = cv.getBoundingClientRect();
    game.onTap(e.clientX - r.left, e.clientY - r.top);
    update();
  });
  $('btnCheckers').onclick = () => start(Checkers);
  $('btnBackgammon').onclick = () => start(Backgammon);
  $('btnTicTacToe').onclick = () => start(TicTacToe);
  $('btnRoll').onclick = () => { if (game) { game.roll(); update(); } };
  $('btnUndo').onclick = () => { if (game) { game.undo(); update(); } };
  $('btnNew').onclick = () => { if (game) start(game); };
  $('btnMenu').onclick = toMenu;
  $('ovNew').onclick = () => { if (game) start(game); };
  $('ovMenu').onclick = toMenu;
  window.addEventListener('resize', resize);

  // Called by the Android back button. Returns true if handled.
  window.androidBack = () => {
    if (!$('confirmDlg').classList.contains('hidden')) { $('confirmDlg').classList.add('hidden'); return true; }
    if (!$('addDlg').classList.contains('hidden')) { AddPlayer.close(); return true; }
    if (!$('laughDlg').classList.contains('hidden')) { LaughRecorder.close(); return true; }
    if (!$('overlay').classList.contains('hidden') || !$('game').classList.contains('hidden')) { toMenu(); return true; }
    return false;
  };

  applyPlayers(() => { syncSettingsUI(); requestDraw(); });
  syncSettingsUI();

  return { update, showWin, hideWin, requestDraw, start, toMenu, syncSettingsUI, choosePlayer, get game() { return game; } };
})();

// ---------- "new player" dialog with photo + circle crop ----------
const AddPlayer = (() => {
  const $ = id => document.getElementById(id);
  const SIZE = 210;          // on-screen crop box (CSS px)
  const OUT = 320;           // saved image size
  const cv = $('cropCv');
  const ctx = cv.getContext('2d');
  let side = 'w', img = null, zoom = 1, cx = 0, cy = 0, gender = 'm';
  const pointers = new Map();
  let pinch = null;

  function open(s) {
    side = s; img = null; zoom = 1; gender = 'm';
    $('newName').value = '';
    $('zoom').value = 1;
    setGender('m');
    $('cropEmpty').classList.remove('hidden');
    $('zoomRow').classList.add('hidden');
    $('cropHint').classList.add('hidden');
    $('cropHint').textContent = 'גררו את התמונה כדי למרכז את הפנים בעיגול';
    $('addDlg').classList.remove('hidden');
    draw();
  }
  function close() { $('addDlg').classList.add('hidden'); }

  function setGender(g) {
    gender = g;
    $('newGender').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.val === g));
  }
  $('newGender').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setGender(b.dataset.val); });

  // scale so the image covers the crop circle at zoom 1
  const baseScale = () => (img ? Math.max(SIZE / img.width, SIZE / img.height) : 1);

  function clamp() {
    if (!img) return;
    const s = baseScale() * zoom;
    const hw = img.width * s / 2, hh = img.height * s / 2;
    const r = SIZE / 2;
    // image center may move so that the image still covers the whole box
    cx = Math.max(Math.min(cx, hw - r), -(hw - r));
    cy = Math.max(Math.min(cy, hh - r), -(hh - r));
  }

  function render(c, size) {
    const k = size / SIZE;
    const s = baseScale() * zoom * k;
    c.drawImage(img, size / 2 + cx * k - img.width * s / 2, size / 2 + cy * k - img.height * s / 2, img.width * s, img.height * s);
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    cv.width = SIZE * dpr; cv.height = SIZE * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (!img) return;
    render(ctx, SIZE);
    // darken outside the circle
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 4, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
    ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 4, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = side === 'b' ? '#111' : '#f4f1ea'; ctx.stroke();
  }

  function loadFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      img = im; zoom = 1; $('zoom').value = 1;
      // portrait photos: faces are usually in the upper part
      const s = baseScale();
      cx = 0; cy = im.height > im.width ? (im.height * s - SIZE) * 0.2 : 0;
      clamp();
      $('cropEmpty').classList.add('hidden');
      $('zoomRow').classList.remove('hidden');
      $('cropHint').textContent = 'גררו את התמונה כדי למרכז את הפנים בעיגול';
      $('cropHint').classList.remove('hidden');
      draw();
    };
    im.onerror = () => { URL.revokeObjectURL(url); alertMsg('לא הצלחתי לפתוח את התמונה'); };
    im.src = url;
  }
  for (const id of ['fileCam', 'fileGal']) {
    $(id).addEventListener('change', e => { loadFile(e.target.files[0]); e.target.value = ''; });
  }

  $('zoom').addEventListener('input', e => { zoom = parseFloat(e.target.value); clamp(); draw(); });

  // drag to move, two fingers to zoom
  cv.addEventListener('pointerdown', e => { if (!img) return; cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); pinch = null; });
  cv.addEventListener('pointermove', e => {
    if (!img || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 1) {
      cx += e.clientX - prev[0]; cy += e.clientY - prev[1];
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) { zoom = Math.max(1, Math.min(4, zoom * d / pinch)); $('zoom').value = zoom; }
      pinch = d;
    }
    clamp(); draw();
  });
  const up = e => { pointers.delete(e.pointerId); pinch = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  function alertMsg(text) {
    $('cropHint').textContent = text;
    $('cropHint').classList.remove('hidden');
  }

  $('addCancel').onclick = close;
  $('addSave').onclick = () => {
    const name = $('newName').value.trim();
    if (!name) { alertMsg('צריך לכתוב שם 🙂'); $('newName').focus(); return; }
    if (!img) { alertMsg('צריך לבחור תמונה 📷'); return; }
    const out = document.createElement('canvas');
    out.width = OUT; out.height = OUT;
    render(out.getContext('2d'), OUT);
    const p = { id: 'p' + Date.now(), name, g: gender, img: out.toDataURL('image/jpeg', 0.85) };
    CUSTOM_PLAYERS.push(p);
    if (!saveCustomPlayers()) { CUSTOM_PLAYERS.pop(); alertMsg('אין מספיק מקום לשמור. מחקו שחקן ישן.'); return; }
    close();
    App.choosePlayer(side, p.id);
    LaughRecorder.open(p.id, true); // offer to record their laugh right away
  };

  return { open, close };
})();

// ---------- recording a player's laugh ----------
// On the phone this uses Android's native recorder (window.AndroidRec, see MainActivity);
// in a desktop browser it falls back to getUserMedia + MediaRecorder.
const LaughRecorder = (() => {
  const $ = id => document.getElementById(id);
  const MAX_SEC = 8;
  let pid = null, state = 'idle', t0 = 0, tick = 0, audio = null;
  let webRec = null, webStream = null;

  function open(id, isNew) {
    pid = id; state = 'idle';
    const p = playerById(id);
    $('laughFace').src = p.img;
    $('laughTitle').textContent = isNew ? 'להקליט צחוק ל' + p.name + '? 😂' : 'הצחוק של ' + p.name;
    $('laughDone').textContent = isNew ? 'אולי אחר כך' : 'סיום';
    status(LAUGHS[id] ? 'יש צחוק שמור. אפשר להקליט חדש.' : 'צחקו חזק לתוך הטלפון! (עד ' + MAX_SEC + ' שניות)');
    $('laughDlg').classList.remove('hidden');
    refresh();
  }

  function close() {
    if (state === 'rec') cancel();
    stopPlay();
    $('laughDlg').classList.add('hidden');
    App.syncSettingsUI();
  }

  function status(t) { $('laughStatus').textContent = t; }

  function refresh() {
    const has = !!LAUGHS[pid];
    $('recBtn').textContent = state === 'rec' ? '⏹️ עצור' : (has ? '🎤 הקלטה חדשה' : '🎤 הקלט');
    $('recBtn').disabled = state === 'wait';
    $('playBtn').disabled = !has || state !== 'idle';
    $('delLaughBtn').disabled = !has || state !== 'idle';
    if (has && state === 'idle' && $('laughDone').textContent === 'אולי אחר כך') $('laughDone').textContent = 'סיום';
  }

  // ---- recorder backends ----
  function start() {
    stopPlay();
    state = 'wait'; refresh();
    status('מבקש גישה למיקרופון…');
    if (window.AndroidRec) { window.AndroidRec.start(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { onEvent('error'); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      webStream = stream;
      const chunks = [];
      webRec = new MediaRecorder(stream);
      webRec.ondataavailable = e => chunks.push(e.data);
      webRec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (webRec && webRec.cancelled) return;
        const fr = new FileReader();
        fr.onload = () => onEvent('done', fr.result);
        fr.readAsDataURL(new Blob(chunks, { type: webRec.mimeType || 'audio/webm' }));
      };
      webRec.start();
      onEvent('started');
    }).catch(() => onEvent('denied'));
  }
  function stop() {
    if (window.AndroidRec) window.AndroidRec.stop();
    else if (webRec && webRec.state === 'recording') webRec.stop();
  }
  function cancel() {
    clearInterval(tick);
    if (window.AndroidRec) window.AndroidRec.cancel();
    else if (webRec) { webRec.cancelled = true; if (webRec.state === 'recording') webRec.stop(); }
    state = 'idle';
  }

  // events from either backend: started | done(dataUrl) | denied | error | short
  function onEvent(ev, data) {
    if (ev === 'started') {
      state = 'rec'; t0 = Date.now();
      clearInterval(tick);
      tick = setInterval(() => {
        const left = Math.ceil(MAX_SEC - (Date.now() - t0) / 1000);
        status('🔴 מקליט… עוד ' + Math.max(0, left) + ' שניות');
        if (left <= 0) { clearInterval(tick); stop(); }
      }, 200);
      status('🔴 מקליט… עוד ' + MAX_SEC + ' שניות');
    } else {
      clearInterval(tick);
      state = 'idle';
      if (ev === 'done' && data) {
        LAUGHS[pid] = data;
        if (saveLaughs()) { status('נשמר! ✅ ככה זה נשמע:'); play(); }
        else { delete LAUGHS[pid]; status('אין מספיק מקום לשמור. נסו הקלטה קצרה יותר.'); }
      } else if (ev === 'denied') status('אין הרשאה למיקרופון. אפשר לאשר בהגדרות הטלפון.');
      else if (ev === 'short') status('ההקלטה קצרה מדי, נסו שוב');
      else status('ההקלטה לא הצליחה, נסו שוב');
    }
    refresh();
  }
  window.onAndroidRec = (ev, b64) => onEvent(ev, b64 ? 'data:audio/mp4;base64,' + b64 : null);

  function play() {
    stopPlay();
    if (!LAUGHS[pid]) return;
    audio = new Audio(LAUGHS[pid]);
    audio.play().catch(() => {});
  }
  function stopPlay() { if (audio) { audio.pause(); audio = null; } }

  $('recBtn').onclick = () => (state === 'rec' ? stop() : start());
  $('playBtn').onclick = play;
  $('delLaughBtn').onclick = () => {
    stopPlay();
    delete LAUGHS[pid]; saveLaughs();
    status('הצחוק נמחק. במארס טורקי יתנגן הצחוק הממוחשב.');
    refresh();
  };
  $('laughDone').onclick = close;

  return { open, close };
})();
