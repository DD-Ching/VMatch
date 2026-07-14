/** DOM overlay: onboarding cards (words allowed — onboarding is not Flow
 *  feedback) and the afterglow action bar (icons only — Flow Mode never shows
 *  words, numbers, or grades; failure-aesthetics law 5). */

const ICONS = {
  retry:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M6 2.5v3.9h3.9"/></svg>',
  replay:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5.5l11 6.5-11 6.5z"/></svg>',
  listen:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h4l5 4.5v-13L8 10z"/><path d="M16.5 9.5a4 4 0 0 1 0 5"/><path d="M18.8 7.2a7.2 7.2 0 0 1 0 9.6"/></svg>',
  toggle:
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h13M14 4.5L17.5 8 14 11.5"/><path d="M20 16H7M10 12.5L6.5 16l3.5 3.5"/></svg>',
};

export class Overlay {
  private card: HTMLElement;
  private bar: HTMLElement;
  private hint: HTMLElement;

  constructor(root: HTMLElement) {
    this.card = document.createElement('div');
    this.card.className = 'vm-card';
    this.bar = document.createElement('div');
    this.bar.className = 'vm-bar';
    this.hint = document.createElement('div');
    this.hint.className = 'vm-hint';
    root.append(this.card, this.bar, this.hint);
    this.hideCard();
    this.hideBar();
    this.setHint('');
  }

  showCard(title: string, body: string, buttonLabel: string, onClick: () => void): void {
    this.card.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = body;
    const b = document.createElement('button');
    b.textContent = buttonLabel;
    b.addEventListener('click', onClick, { once: true });
    this.card.append(h, p, b);
    this.card.style.display = 'flex';
    b.focus();
  }

  hideCard(): void {
    this.card.style.display = 'none';
  }

  /** Afterglow action bar: icon-only (retry / replay / aligned-raw / listen). */
  showBar(actions: { retry(): void; replay(): void; toggleAligned(): boolean; listen(): void }): void {
    this.bar.innerHTML = '';
    const mk = (svg: string, label: string, fn: (btn: HTMLButtonElement) => void) => {
      const b = document.createElement('button');
      b.innerHTML = svg;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => fn(b));
      this.bar.appendChild(b);
      return b;
    };
    mk(ICONS.retry, 'retry', () => actions.retry());
    mk(ICONS.replay, 'replay', () => actions.replay());
    const t = mk(ICONS.toggle, 'replay timing: aligned / raw', (btn) => {
      const aligned = actions.toggleAligned();
      btn.style.opacity = aligned ? '1' : '0.55';
    });
    t.style.opacity = '1';
    mk(ICONS.listen, 'listen again', () => actions.listen());
    this.bar.style.display = 'flex';
  }

  hideBar(): void {
    this.bar.style.display = 'none';
  }

  setHint(text: string): void {
    this.hint.textContent = text;
    this.hint.style.display = text ? 'block' : 'none';
  }
}
