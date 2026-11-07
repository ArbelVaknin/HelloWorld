'use strict';
// Shared helpers. Colors: 'b' = black = Emma, 'w' = white = Dad.

const NAMES = { b: 'אמה', w: 'אבא' };
const IMG = {};
const opp = c => (c === 'w' ? 'b' : 'w');

const SETTINGS_KEY = 'emmagames.settings';
const S = Object.assign(
  { opponent: 'human', myColor: 'w', level: 'mid', ck_force: true, ck_back: false, ck_fly: false },
  (() => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; } })()
);
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S)); } catch (e) {} }

const isCpu = color => S.opponent === 'cpu' && color !== S.myColor;

function loadImages(cb) {
  let n = 0;
  for (const [k, src] of [['b', 'emma.jpg'], ['w', 'dad.jpg']]) {
    const im = new Image();
    im.onload = im.onerror = () => { if (++n === 2) cb(); };
    im.src = src;
    IMG[k] = im;
  }
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function disc(ctx, color, x, y, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = r * 0.35; ctx.shadowOffsetY = r * 0.12;
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  if (color === 'w') { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d9d2c2'); }
  else { g.addColorStop(0, '#4a4a4f'); g.addColorStop(1, '#0d0d0f'); }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
  ctx.lineWidth = 1; ctx.strokeStyle = color === 'w' ? '#8f8873' : '#000'; ctx.stroke();
}

// A plain checkers man.
function drawPlainPiece(ctx, color, x, y, r) {
  disc(ctx, color, x, y, r);
  ctx.lineWidth = Math.max(1, r * 0.08);
  ctx.strokeStyle = color === 'w' ? 'rgba(0,0,0,.15)' : 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.arc(x, y, r * 0.68, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, Math.PI * 2); ctx.stroke();
}

// A piece showing the face (Emma for black, Dad for white).
function drawFacePiece(ctx, color, x, y, r, inner = 0.8) {
  disc(ctx, color, x, y, r);
  const ir = r * inner;
  const im = IMG[color];
  if (im && im.complete && im.naturalWidth) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, ir, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(im, x - ir, y - ir, ir * 2, ir * 2);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(x, y, ir, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = color === 'w' ? '#a69f8c' : '#000';
  ctx.stroke();
}

function glow(ctx, x, y, r, col, w = 3) {
  ctx.beginPath(); ctx.arc(x, y, r + w * 0.5, 0, Math.PI * 2);
  ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDie(ctx, x, y, s, v, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = s * 0.15; ctx.shadowOffsetY = s * 0.06;
  roundRect(ctx, x - s / 2, y - s / 2, s, s, s * 0.18);
  ctx.fillStyle = color === 'w' ? '#fbf8f0' : '#1d1d1f'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1; ctx.strokeStyle = color === 'w' ? '#888' : '#666'; ctx.stroke();
  ctx.fillStyle = color === 'w' ? '#1d1d1f' : '#fbf8f0';
  const o = s * 0.26, pr = s * 0.09;
  const pip = (dx, dy) => { ctx.beginPath(); ctx.arc(x + dx * o, y + dy * o, pr, 0, Math.PI * 2); ctx.fill(); };
  if (v % 2 === 1) pip(0, 0);
  if (v >= 2) { pip(-1, -1); pip(1, 1); }
  if (v >= 4) { pip(1, -1); pip(-1, 1); }
  if (v === 6) { pip(-1, 0); pip(1, 0); }
  ctx.restore();
}

const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
