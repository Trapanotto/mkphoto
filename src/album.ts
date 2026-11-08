import { deletePhoto, listPhotos, type Photo } from './photos';
import { setStars, starNumber } from './ratingCard';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Full-screen photo album with a large view, download, share and delete. */
export class Album {
  isOpen = false;
  private readonly el = $('album');
  private readonly grid = $('album-grid');
  private readonly empty = $('album-empty');
  private readonly lightbox = $('lightbox');
  private readonly bigImage = $<HTMLImageElement>('lightbox-img');
  private readonly meta = $('lightbox-meta');
  private readonly shareButton = $<HTMLButtonElement>('lightbox-share');
  private urls: string[] = [];
  private photos: Photo[] = [];
  private current: Photo | null = null;

  constructor() {
    $('album-close').addEventListener('click', () => this.close());
    $('lightbox-close').addEventListener('click', () => this.closePhoto());
    $('lightbox-download').addEventListener('click', () => this.download());
    $('lightbox-delete').addEventListener('click', () => this.remove());
    this.shareButton.addEventListener('click', () => this.share());
    // keep taps here from reaching the flight controls underneath
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  toggle() {
    if (this.isOpen) this.close();
    else void this.open();
  }

  async open() {
    this.isOpen = true;
    this.el.hidden = false;
    this.photos = await listPhotos();
    this.renderGrid();
  }

  close() {
    this.closePhoto();
    this.isOpen = false;
    this.el.hidden = true;
    this.revoke();
  }

  /** Escape: lightbox first, then the album. Returns true if something closed. */
  back() {
    if (!this.lightbox.hidden) {
      this.closePhoto();
      return true;
    }
    if (this.isOpen) {
      this.close();
      return true;
    }
    return false;
  }

  private revoke() {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }

  private url(blob: Blob) {
    const u = URL.createObjectURL(blob);
    this.urls.push(u);
    return u;
  }

  private renderGrid() {
    this.revoke();
    this.grid.replaceChildren();
    this.empty.hidden = this.photos.length > 0;
    for (const p of this.photos) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'album-item';
      const img = document.createElement('img');
      img.src = this.url(p.thumb);
      img.alt = p.tags.join(', ') || 'Foto';
      const label = document.createElement('span');
      label.textContent = p.tags.join(' · ') || 'Ohne Motiv';
      button.append(img, label);
      if (p.rating) {
        const stars = document.createElement('span');
        setStars(stars, p.rating.stars);
        stars.classList.add('album-stars');
        button.append(stars);
      }
      button.addEventListener('click', () => this.showPhoto(p));
      this.grid.append(button);
    }
  }

  private showPhoto(p: Photo) {
    this.current = p;
    this.bigImage.src = this.url(p.image);
    const date = new Date(p.created).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });
    this.meta.textContent =
      `${p.tags.join(' · ') || 'Ohne Motiv'}\n` +
      `${date} · Spielzeit ${p.gameTime}\n` +
      `${p.focal} mm · Neigung ${p.gimbal}° · Höhe ${p.altitude} m · ${p.width}×${p.height} px` +
      (p.rating ? `\n\n${starNumber(p.rating.stars)} ★ · ${p.rating.lines.join('\n')}\n«${p.rating.comment}»` : '');
    this.shareButton.hidden = !this.canShare(p);
    this.lightbox.hidden = false;
  }

  private closePhoto() {
    this.lightbox.hidden = true;
    this.current = null;
  }

  private fileName(p: Photo) {
    const slug = (p.tags[0] ?? 'foto').toLowerCase().replace(/[^a-z0-9äöü]+/g, '-');
    return `mkphoto-${slug}-${p.created.slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
  }

  private file(p: Photo) {
    return new File([p.image], this.fileName(p), { type: 'image/jpeg' });
  }

  private canShare(p: Photo) {
    try {
      return !!navigator.canShare?.({ files: [this.file(p)] });
    } catch {
      return false;
    }
  }

  private download() {
    if (!this.current) return;
    const a = document.createElement('a');
    a.href = this.url(this.current.image);
    a.download = this.fileName(this.current);
    a.click();
  }

  private async share() {
    if (!this.current) return;
    try {
      await navigator.share({ files: [this.file(this.current)], title: 'MKPHOTO' });
    } catch {
      // cancelled by the user
    }
  }

  private async remove() {
    if (!this.current) return;
    if (!window.confirm('Foto löschen?')) return;
    await deletePhoto(this.current.id);
    this.closePhoto();
    this.photos = await listPhotos();
    this.renderGrid();
  }
}

/** Short mechanical shutter click, synthesised so no audio file is needed. */
let audio: AudioContext | null = null;
export function shutterSound() {
  try {
    audio ??= new AudioContext();
    const len = Math.floor(audio.sampleRate * 0.06);
    const buffer = audio.createBuffer(1, len, audio.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // two quick clicks: shutter opening and closing
      const env = Math.exp(-t * 30) + 0.6 * Math.exp(-Math.abs(t - 0.55) * 60);
      data[i] = (Math.random() * 2 - 1) * env * 0.5;
    }
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.connect(audio.destination);
    src.start();
  } catch {
    // audio not available
  }
}
