const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export type MenuAction = 'play' | 'newGame' | 'studio' | 'album' | 'quality' | 'mode' | 'reset' | 'home' | 'time';

/** Title screen and pause menu. The game keeps rendering behind it. */
export class MainMenu {
  isOpen = true;
  onAction?: (a: MenuAction) => void;
  private readonly el = $('menu');
  private readonly options = $('menu-options');

  constructor() {
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('button[data-action]')) {
      b.addEventListener('click', () => {
        const action = b.dataset.action as MenuAction | 'options' | 'back';
        if (action === 'options') this.showOptions(true);
        else if (action === 'back') this.showOptions(false);
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
    $('menu-time').hidden = !started;
  }

  setLabels(quality: string, mode: string) {
    $('menu-quality').textContent = `Grafik: ${quality}`;
    $('menu-mode').textContent = `Steuerung: ${mode}`;
  }

  open() {
    this.isOpen = true;
    this.el.hidden = false;
    this.showOptions(false);
    document.body.dataset.screen = 'menu';
  }

  close() {
    this.isOpen = false;
    this.el.hidden = true;
    document.body.dataset.screen = 'game';
  }

  private showOptions(on: boolean) {
    this.options.hidden = !on;
    $('menu-main').hidden = on;
  }
}

/** One-time welcome text for a new game. */
export class Intro {
  isOpen = false;
  onDone?: () => void;
  private readonly el = $('intro');

  constructor() {
    $('intro-go').addEventListener('click', () => {
      this.isOpen = false;
      this.el.hidden = true;
      this.onDone?.();
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  open() {
    this.isOpen = true;
    this.el.hidden = false;
  }
}
