import { chf, type Assignment } from './assignments';
import type { Check, Rating } from './rating';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const starNumber = (stars: number) => stars.toFixed(1).replace('.', ',');

/** Five stars filled up to the score (half stars included), drawn with a CSS gradient. */
export function setStars(el: HTMLElement, stars: number) {
  el.classList.add('stars');
  el.textContent = '★★★★★';
  el.style.setProperty('--fill', `${(stars / 5) * 100}%`);
  el.setAttribute('aria-label', `${starNumber(stars)} von 5 Sternen`);
}

/** What handing in this photo would bring, or why it can't be handed in. */
export interface Offer {
  canSubmit: boolean;
  fee: number;
  reputation: number;
  note: string;
}

/** Card that pops up after each shot with the stars, the reasons and the client's comment. */
export class RatingCard {
  isOpen = false;
  onSubmit?: () => void;
  private readonly el = $('rating');
  private readonly submit = $<HTMLButtonElement>('rating-submit');
  private url = '';

  constructor() {
    $('rating-close').addEventListener('click', () => this.close());
    this.submit.addEventListener('click', () => {
      this.close();
      this.onSubmit?.();
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  show(rating: Rating, thumb: Blob, assignment: Assignment | null, offer: Offer | null) {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(thumb);
    $<HTMLImageElement>('rating-img').src = this.url;
    $('rating-title').textContent = assignment ? assignment.title : 'Freies Foto';
    setStars($('rating-stars'), rating.stars);
    $('rating-number').textContent = starNumber(rating.stars);
    const status = $('rating-status');
    status.textContent = offer ? offer.note : rating.subjects.length ? rating.subjects.join(' · ') : 'Kein bekanntes Motiv';
    status.dataset.ok = String(!!offer?.canSubmit);

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

    this.submit.hidden = !offer?.canSubmit;
    if (offer?.canSubmit) {
      const parts = [offer.fee ? chf(offer.fee) : '', offer.reputation ? `+${offer.reputation} Ruf` : ''].filter(Boolean);
      this.submit.textContent = `Einreichen${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
    }
    $('rating-close').textContent = offer?.canSubmit ? 'Behalten, weiter fotografieren' : 'Weiter';

    this.isOpen = true;
    this.el.hidden = false;
  }

  close() {
    this.isOpen = false;
    this.el.hidden = true;
  }
}

/** The active job in the corner, with its checklist. */
export class BriefPanel {
  private readonly el = $('brief');
  /** Opens the studio from the link inside the chip. */
  onStudio?: () => void;

  constructor() {
    // tap folds the chip; the studio link opens the studio
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('#brief-studio')) this.onStudio?.();
      else this.el.classList.toggle('folded');
    });
  }

  show(a: Assignment | null, best: number | null, studioKey: string) {
    this.el.hidden = false;
    this.el.classList.remove('folded');
    if (!a) {
      $('brief-title').textContent = 'Kein Auftrag';
      $('brief-text').textContent = `Aufträge gibt es im Studio (${studioKey}).`;
      $('brief-from').textContent = '';
      $('brief-best').textContent = '';
      $('brief-list').replaceChildren();
      return;
    }
    $('brief-title').textContent = a.title;
    $('brief-text').textContent = a.brief;
    $('brief-from').textContent = `${a.contact}, ${a.client} · ${chf(a.reward)}`;
    $('brief-best').textContent = best === null ? '' : `Bisher eingereicht: ${starNumber(best)} ★`;
    $('brief-list').replaceChildren();
  }

  /** Live checklist: ✓ met, ✗ missing, • not known yet (e.g. camera wishes while flying). */
  updateChecks(checks: Check[]) {
    const list = $('brief-list');
    while (list.children.length < checks.length) list.append(document.createElement('li'));
    while (list.children.length > checks.length) list.lastElementChild!.remove();
    checks.forEach((c, i) => {
      const li = list.children[i] as HTMLElement;
      const text = `${c.ok === null ? '•' : c.ok ? '✓' : '✗'} ${c.label}`;
      if (li.textContent !== text) li.textContent = text;
      li.dataset.state = c.ok === null ? 'open' : c.ok ? 'ok' : 'no';
    });
  }

  set visible(v: boolean) {
    this.el.hidden = !v;
  }
}

/** Plain-language checklist of what a job asks for. */
export function requirementLabels(a: Assignment, names?: Record<string, string>) {
  const subjectName = (id: string) => names?.[id] ?? ({ kapellbruecke: 'Kapellbrücke', wasserturm: 'Wasserturm' } as Record<string, string>)[id] ?? id;
  const out = [a.subjects.map(subjectName).join(' + ')];
  if (a.orientation) out.push(a.orientation === 'landscape' ? 'Querformat' : 'Hochformat');
  if (a.heading) out.push(a.heading.label);
  else if (a.horizon) out.push('Horizont im Bild');
  if (a.hours) out.push(a.hours.label);
  if (a.gimbalMax) out.push(a.gimbalMax.label);
  if (a.altitudeMax) out.push(a.altitudeMax.label);
  if (a.focalMin) out.push(a.focalMin.label);
  return out;
}
