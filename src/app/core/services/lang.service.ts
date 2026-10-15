import { Injectable, signal, effect } from '@angular/core';

export type Lang = 'en' | 'ar';

@Injectable({ providedIn: 'root' })
export class LangService {
    private readonly STORAGE_KEY = 'endpoints-hub-lang';

    lang = signal<Lang>(this.loadLang());

    constructor() {
        effect(() => {
            const l = this.lang();
            document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
            document.documentElement.setAttribute('lang', l);
            localStorage.setItem(this.STORAGE_KEY, l);
        });
    }

    toggle(): void {
        this.lang.update(l => l === 'en' ? 'ar' : 'en');
    }

    private loadLang(): Lang {
        const saved = localStorage.getItem(this.STORAGE_KEY);

        if (saved === 'en' || saved === 'ar') return saved;

        return 'en';
    }
}