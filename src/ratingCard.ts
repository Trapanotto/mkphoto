import type { Assignment } from './assignments';
import type { Rating } from './rating';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Five stars filled up to the score (half stars included), drawn with a CSS gradient. */
export function setStars(el: HTMLElement, stars: number) {
  el.classList.add('stars');
  el.textContent = '★★★★★';
  el.style.setProperty('--fill', `${(stars / 5) * 100}%`);
  el.setAttribute('aria-label', `${starNumber(stars)} von 5 Sternen`);
}

export const starNumber = (stars: number) => stars.toFixed(1).replace('.', ',');

/** Card that pops up after each shot with the stars, the reasons and the client's comment. */
export class RatingCard {
  isOpen = false;
  private readonly el = $('rating');
  private url = '';

  constructor() {
    $('rating-close').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  show(rating: Rating, thumb: Blob, assignment: Assignment | null) {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(thumb);
    $<HTMLImageElement>('rating-img').src = this.url;
    $('rating-title').textContent = assignment ? assignment.title : 'Freies Foto';
    setStars($('rating-stars'), rating.stars);
    $('rating-number').textContent = starNumber(rating.stars);
    $('rating-status').textContent = assignment
      ? rating.fulfilled
        ? 'Auftrag erfüllt'
        : 'Auftrag noch nicht erfüllt (ab 3 Sternen)'
      : rating.subjects.length
        ? rating.subjects.join(' · ')
        : 'Kein bekanntes Motiv';
    $('rating-status').dataset.ok = String(rating.fulfilled);

    const list = $('rating-criteria');
    list.replaceChildren();
    for (const c of rating.criteria) {
      const row = document.createElement('li');
      const head = document.createElement('div');
      head.className = 'crit-head';
      const label = document.createElement('b');
      label.textContent = c.label;
      const bar = document.createElement('span');
      bar.className = 'crit-bar';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round(c.score * 100)}%`;
      fill.dataset.level = c.score >= 0.75 ? 'good' : c.score >= 0.5 ? 'mid' : 'low';
      bar.append(fill);
      head.append(label, bar);
      const text = document.createElement('p');
      text.textContent = c.text;
      row.append(head, text);
      list.append(row);
    }

    const bonus = $('rating-bonus');
    bonus.textContent = rating.bonus.length ? `Bonus: ${rating.bonus.join(' · ')}` : '';
    bonus.hidden = !rating.bonus.length;

    $('rating-comment').textContent = `«${rating.comment}»`;
    $('rating-from').textContent = assignment ? `${assignment.contact}, ${assignment.client}` : 'Deine Notiz';

    this.isOpen = true;
    this.el.hidden = false;
  }

  close() {
    this.isOpen = false;
    this.el.hidden = true;
  }
}

/** The job briefing in the corner, with the best result so far. */
export class BriefPanel {
  private readonly el = $('brief');

  show(a: Assignment | null, best: number | null) {
    this.el.hidden = !a;
    if (!a) return;
    $('brief-title').textContent = a.title;
    $('brief-text').textContent = a.brief;
    $('brief-from').textContent = `${a.contact}, ${a.client}`;
    $('brief-best').textContent =
      best === null ? 'Noch kein Foto' : `Bestes Foto: ${starNumber(best)} ★${best >= 3 ? ' · erfüllt' : ''}`;
  }
}

const BEST_KEY = 'mkphoto.best.';

export function loadBest(id: string): number | null {
  try {
    const v = localStorage.getItem(BEST_KEY + id);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export function saveBest(id: string, stars: number) {
  try {
    const prev = loadBest(id);
    if (prev === null || stars > prev) localStorage.setItem(BEST_KEY + id, String(stars));
  } catch {
    // storage blocked: the best score just isn't remembered
  }
}
