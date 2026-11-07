'use strict';
// A synthesized rolling "ha-ha-ha" laugh (a few voices together), made with Web Audio.
// No sound files needed. Used for מארס טורקי.

const Laugh = (() => {
  let ac = null, master = null, noiseBuf = null, endTimer = 0;

  function getCtx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') { try { const r = ac.resume(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
    return ac;
  }

  function noise() {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  // vowel formants for "a" and a slightly brighter "e", varied per syllable
  const VOWELS = [
    [[800, 6, 1], [1250, 8, 0.55], [2600, 10, 0.22]],
    [[650, 6, 1], [1700, 9, 0.5], [2700, 10, 0.2]],
  ];

  // one "ha" syllable: breathy "h" followed by a voiced vowel with falling pitch
  function ha(out, t, f0, dur, vol) {
    const n = ac.createBufferSource(); n.buffer = noise();
    const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1500; nf.Q.value = 0.7;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(vol * 0.35, t + 0.025);
    ng.gain.linearRampToValueAtTime(0, t + 0.07);
    n.connect(nf); nf.connect(ng); ng.connect(out);
    n.start(t, Math.random() * 1.5, 0.09);

    const tv = t + 0.035;
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.1, tv);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.82, tv + dur);
    // a little wobble so it sounds alive
    const lfo = ac.createOscillator(); lfo.frequency.value = 6 + Math.random() * 3;
    const lg = ac.createGain(); lg.gain.value = f0 * 0.03;
    lfo.connect(lg); lg.connect(o.frequency);

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, tv);
    g.gain.exponentialRampToValueAtTime(vol, tv + 0.02);
    g.gain.setValueAtTime(vol, tv + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, tv + dur);
    const vowel = VOWELS[Math.random() < 0.75 ? 0 : 1];
    for (const [f, q, a] of vowel) {
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (0.95 + Math.random() * 0.1); bp.Q.value = q;
      const ga = ac.createGain(); ga.gain.value = a * 3;
      o.connect(bp); bp.connect(ga); ga.connect(g);
    }
    g.connect(out);
    o.start(tv); o.stop(tv + dur + 0.05);
    lfo.start(tv); lfo.stop(tv + dur + 0.05);
  }

  // a wheezy in-breath between bursts
  function gasp(out, t, vol) {
    const n = ac.createBufferSource(); n.buffer = noise();
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(2200, t + 0.35);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.3, t + 0.15);
    g.gain.linearRampToValueAtTime(0, t + 0.38);
    n.connect(f); f.connect(g); g.connect(out);
    n.start(t, Math.random(), 0.4);
  }

  function laugher(out, t0, base, total, vol) {
    let t = t0;
    while (t < t0 + total) {
      const count = 4 + Math.floor(Math.random() * 5);
      let f = base * (1.15 + Math.random() * 0.25);
      for (let i = 0; i < count; i++) {
        const d = 0.09 + Math.random() * 0.05;
        ha(out, t, f, d, vol);
        t += d + 0.06 + Math.random() * 0.03;
        f *= 0.95;
      }
      gasp(out, t + 0.03, vol);
      t += 0.42 + Math.random() * 0.15;
    }
  }

  function play(seconds = 5.5) {
    const a = getCtx();
    if (!a) return;
    stop();
    master = a.createGain();
    master.gain.value = 0.9;
    const comp = a.createDynamicsCompressor();
    master.connect(comp); comp.connect(a.destination);
    const t = a.currentTime + 0.05;
    laugher(master, t, 260, seconds, 0.4);              // main laugher
    laugher(master, t + 0.3, 165, seconds - 0.4, 0.32);  // deep belly laugh
    laugher(master, t + 0.7, 390, seconds - 1, 0.18);    // high giggle
    const m = master;
    clearTimeout(endTimer);
    endTimer = setTimeout(() => { if (master === m) stop(); }, (seconds + 1.5) * 1000);
  }

  function stop() {
    if (!master) return;
    const m = master;
    master = null;
    try { m.gain.setTargetAtTime(0, ac.currentTime, 0.08); } catch (e) {}
    setTimeout(() => { try { m.disconnect(); } catch (e) {} }, 600);
  }

  // Browsers only allow sound after a touch; call this from any tap.
  function unlock() { getCtx(); }

  return { play, stop, unlock };
})();
