import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'twk-theme';

  theme = signal<Theme>(this.loadTheme());

  constructor() {
    effect(() => {
      const t = this.theme();
      document.body.classList.toggle('dark-mode', t === 'dark');
      localStorage.setItem(this.STORAGE_KEY, t);
    });
  }

  toggle(): void {
    this.theme.update(t => t === 'light' ? 'dark' : 'light');
  }

  private loadTheme(): Theme {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return 'light'; // TWK default is light
  }
}
