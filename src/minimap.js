// Minikarte: Luftbild-Atlas (norden oben), Drohne, Ziel, Wahrzeichen, Startpunkt, Flugverbotszonen.
export class Minimap {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.atlas = null; // { canvas, west, east, north, south }
    this.range = 260;   // Meter vom Zentrum bis Rand
  }
  setAtlas(a) { this.atlas = a; }

  draw(state) {
    const { c, g } = this;
    const dpr = Math.min(devicePixelRatio, 2);
    const size = c.clientWidth;
    if (!size) return;
    if (c.width !== Math.round(size * dpr)) { c.width = c.height = Math.round(size * dpr); }
    const W = c.width, R = this.range;
    const k = W / (2 * R);
    const { drone, heading, target, landmarks, home, noFly } = state;
    // Welt (x Ost, z Süd) -> Karte
    const mx = (x) => (x - drone.x) * k + W / 2;
    const my = (z) => (z - drone.z) * k + W / 2;
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#1b2228'; g.fillRect(0, 0, W, W);
    const a = this.atlas;
    if (a) {
      const sx = (drone.x - R - a.west) / (a.east - a.west) * a.canvas.width;
      const sy = (drone.z - R - a.north) / (a.south - a.north) * a.canvas.height;
      const sw = 2 * R / (a.east - a.west) * a.canvas.width;
      const sh = 2 * R / (a.south - a.north) * a.canvas.height;
      g.globalAlpha = 0.95;
      g.drawImage(a.canvas, sx, sy, sw, sh, 0, 0, W, W);
      g.globalAlpha = 1;
    }
    g.lineWidth = 2 * dpr;
    for (const nf of noFly) {
      g.beginPath(); g.arc(mx(nf.x), my(nf.z), nf.r * k, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,40,40,.25)'; g.fill(); g.strokeStyle = '#ff4d4d'; g.stroke();
    }
    for (const l of landmarks) {
      g.beginPath(); g.arc(mx(l.x), my(l.z), 4 * dpr, 0, Math.PI * 2);
      g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5 * dpr; g.stroke();
    }
    if (home) {
      g.fillStyle = '#fff'; g.font = `bold ${10 * dpr}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('H', mx(home.x), my(home.z));
    }
    if (target) {
      const tx = Math.max(8 * dpr, Math.min(W - 8 * dpr, mx(target.x))), ty = Math.max(8 * dpr, Math.min(W - 8 * dpr, my(target.z)));
      g.beginPath(); g.arc(tx, ty, 6 * dpr, 0, Math.PI * 2);
      g.strokeStyle = '#ffd400'; g.lineWidth = 2.5 * dpr; g.stroke();
    }
    // Drohne als Pfeil
    g.translate(W / 2, W / 2);
    g.rotate(heading);
    g.beginPath(); g.moveTo(0, -9 * dpr); g.lineTo(6 * dpr, 7 * dpr); g.lineTo(0, 3 * dpr); g.lineTo(-6 * dpr, 7 * dpr); g.closePath();
    g.fillStyle = '#ffd400'; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 1.5 * dpr; g.stroke();
    g.restore();
    // Nordmarke
    g.fillStyle = '#fff'; g.font = `bold ${10 * dpr}px system-ui`; g.textAlign = 'center';
    g.fillText('N', W / 2, 11 * dpr);
  }
}
