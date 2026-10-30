// Synthetische Klänge (kein Audio-Download nötig): Propeller-Surren, Auslöser, Anstossen.
export class Sound {
  constructor() { this.ctx = null; this.motor = null; }

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
  }

  startMotor() {
    this.unlock();
    const c = this.ctx;
    if (!c || this.motor) return;
    const gain = c.createGain(); gain.gain.value = 0;
    const filter = c.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = 0.8;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 180;
    const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 183;
    // Rauschen
    const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const ng = c.createGain(); ng.gain.value = 0.35;
    o1.connect(filter); o2.connect(filter); noise.connect(ng).connect(filter);
    filter.connect(gain).connect(c.destination);
    o1.start(); o2.start(); noise.start();
    this.motor = { gain, o1, o2, filter, noise };
  }

  setMotor(level) {
    if (!this.motor || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.motor.gain.gain.setTargetAtTime(level * 0.05, t, 0.1);
    const f = 170 + level * 90;
    this.motor.o1.frequency.setTargetAtTime(f, t, 0.15);
    this.motor.o2.frequency.setTargetAtTime(f * 1.017, t, 0.15);
    this.motor.filter.frequency.setTargetAtTime(700 + level * 900, t, 0.15);
  }

  stopMotor() {
    if (!this.motor) return;
    const m = this.motor;
    this.motor = null;
    for (const n of [m.o1, m.o2, m.noise]) { try { n.stop(); } catch { /* bereits gestoppt */ } }
    m.gain.disconnect();
  }

  blip(freq, dur, type = 'square', vol = 0.15) {
    const c = this.ctx;
    if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }

  shutter() {
    const c = this.ctx;
    if (!c) return;
    const len = Math.floor(c.sampleRate * 0.09);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = (t < 0.15 ? 1 : 0) + (t > 0.55 && t < 0.7 ? 0.8 : 0);
      d[i] = (Math.random() * 2 - 1) * env * (1 - t);
    }
    const s = c.createBufferSource(); s.buffer = buf;
    const g = c.createGain(); g.gain.value = 0.5;
    s.connect(g).connect(c.destination);
    s.start();
  }

  bump() { this.blip(90, 0.15, 'sine', 0.3); }
}
