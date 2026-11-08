import { chf, feeFor, LEVEL_NAMES, levelOf, type Assignment } from './assignments';
import { requirementLabels, setStars, starNumber } from './ratingCard';
import type { SaveGame } from './save';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** The studio: money, reputation and the job board. */
export class Studio {
  isOpen = false;
  onAccept?: (job: Assignment) => void;
  onCancel?: () => void;
  private readonly el = $('studio');

  constructor(
    private readonly jobs: Assignment[],
    private readonly game: () => SaveGame,
  ) {
    $('studio-close').addEventListener('click', () => this.close());
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  open() {
    this.isOpen = true;
    this.el.hidden = false;
    this.render();
  }

  close() {
    this.isOpen = false;
    this.el.hidden = true;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  render() {
    const g = this.game();
    const lv = levelOf(g.reputation);
    $('studio-money').textContent = chf(g.money);
    $('studio-level').textContent = `${lv.name} · ${g.reputation} Ruf`;
    $('studio-next').textContent = lv.next === null ? 'Höchste Stufe erreicht' : `Nächste Stufe ${LEVEL_NAMES[lv.level]} ab ${lv.next} Ruf`;
    $('studio-progress').style.width = `${Math.round(lv.progress * 100)}%`;

    const list = $('studio-jobs');
    list.replaceChildren();
    // open jobs first, then done ones, locked last
    const order = (j: Assignment) => (j.level > lv.level ? 3 : g.jobs[j.id] ? 2 : g.activeJob === j.id ? 0 : 1);
    for (const job of [...this.jobs].sort((a, b) => order(a) - order(b) || a.level - b.level)) {
      list.append(this.card(job, g, lv.level));
    }
  }

  private card(job: Assignment, g: SaveGame, level: number) {
    const done = g.jobs[job.id];
    const active = g.activeJob === job.id;
    const locked = job.level > level;
    const card = document.createElement('article');
    card.className = 'job';
    card.dataset.state = locked ? 'locked' : active ? 'active' : done ? 'done' : 'open';

    const head = document.createElement('header');
    const title = document.createElement('h3');
    title.textContent = job.title;
    const badge = document.createElement('span');
    badge.className = 'job-badge';
    badge.textContent = locked ? `Ab ${LEVEL_NAMES[job.level - 1]}` : active ? 'Aktiv' : done ? 'Erledigt' : 'Offen';
    head.append(title, badge);

    const client = document.createElement('p');
    client.className = 'job-client';
    client.textContent = `${job.client} · ${job.contact}`;
    const brief = document.createElement('p');
    brief.textContent = job.brief;
    const reqs = document.createElement('ul');
    reqs.className = 'job-reqs';
    for (const r of requirementLabels(job)) {
      const li = document.createElement('li');
      li.textContent = r;
      reqs.append(li);
    }

    const foot = document.createElement('footer');
    const pay = document.createElement('span');
    pay.className = 'job-pay';
    pay.textContent = `bis ${chf(feeFor(job, 5, false))} · +${job.reputation} Ruf`;
    foot.append(pay);
    if (done) {
      const stars = document.createElement('span');
      setStars(stars, done.stars);
      stars.title = `${starNumber(done.stars)} Sterne`;
      foot.append(stars);
    }

    if (!locked) {
      const button = document.createElement('button');
      button.type = 'button';
      if (active) {
        button.textContent = 'Abbrechen';
        button.className = 'secondary';
        button.addEventListener('click', () => {
          this.onCancel?.();
          this.render();
        });
      } else {
        button.textContent = done ? 'Nochmals fotografieren' : 'Annehmen';
        button.addEventListener('click', () => {
          this.onAccept?.(job);
          this.close();
        });
      }
      foot.append(button);
    }

    card.append(head, client, brief, reqs, foot);
    return card;
  }
}
