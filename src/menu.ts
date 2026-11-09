const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export type MenuAction = 'play' | 'newGame' | 'studio' | 'album' | 'quality' | 'mode' | 'reset' | 'home' | `region:${string}`;

/** Title screen and pause menu. The game keeps rendering behind it. */
export class MainMenu {
  isOpen = true;
  onAction?: (a: MenuAction) => void;
  private readonly el = $('menu');
  private readonly options = $('menu-options');
  private readonly regions = $('menu-regions');

  constructor() {
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
      b.addEventListener('click', () => {
        const action = b.dataset.action as MenuAction | 'options' | 'regions' | 'back';
        if (action === 'options') this.showPanel('options');
        else if (action === 'regions') this.showPanel('regions');
        else if (action === 'back') this.showPanel('main');
        else this.onAction?.(action);
      });
    }
  }

  /** Title screen state: first start offers only a new game, later "continue" too. */
  setHasSave(hasSave: boolean, started: boolean) {
    const play = $('menu-play');
    play.textContent = started ? 'Weiterspielen' : hasSave ? 'Weiterspielen' : 'Spiel starten';
    $('menu-new').hidden = !hasSave && !started;
  }

  /** Money and reputation, plus the in-game shortcuts once a game runs. */
  setGame(wallet: string | null, started: boolean) {
    const w = $('menu-wallet');
    w.textContent = wallet ?? '';
    w.hidden = !wallet;
    $('menu-home').hidden = !started;
  }

  setLabels(quality: string, mode: string) {
    $('menu-quality').textContent = `Grafik: ${quality}`;
    $('menu-mode').textContent = `Steuerung: ${mode}`;
  }

  open() {
    this.isOpen = true;
    this.el.hidden = false;
    this.showPanel('main');
    document.body.dataset.screen = 'menu';
  }

  close() {
    this.isOpen = false;
    this.el.hidden = true;
    document.body.dataset.screen = 'game';
  }

  /** Marks the region being played in the region list. */
  setRegion(id: string) {
    for (const b of this.regions.querySelectorAll<HTMLButtonElement>('button[data-action^="region:"]')) {
      b.classList.toggle('current', b.dataset.action === `region:${id}`);
    }
  }

  private showPanel(which: 'main' | 'options' | 'regions') {
    this.options.hidden = which !== 'options';
    this.regions.hidden = which !== 'regions';
    $('menu-main').hidden = which !== 'main';
  }
}
