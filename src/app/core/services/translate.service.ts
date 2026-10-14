import { Injectable, inject, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, filter, firstValueFrom } from 'rxjs';
import { LangService } from './lang.service';

@Injectable({ providedIn: 'root' })
export class TranslateService {
    private http = inject(HttpClient);
    private lang = inject(LangService);

    private subject = new BehaviorSubject<Record<string, string>>({});
    /** Emit whenever translations are (re)loaded — used by TranslatePipe */
    translations$ = this.subject.asObservable();

    constructor() {
        // effect() tracks lang.lang() signal; re-runs whenever language changes
        effect(() => {
            const l = this.lang.lang();
            this.http
                .get<Record<string, string>>(`assets/i18n/${l}.json`)
                .subscribe(data => this.subject.next(data));
        });
    }

    /** Called by APP_INITIALIZER — resolves once the first translation file is loaded. */
    init(): Promise<void> {
        // effect() only runs after bootstrap, so we trigger the HTTP load directly here
        const l = this.lang.lang();
        this.http
            .get<Record<string, string>>(`assets/i18n/${l}.json`)
            .subscribe(data => this.subject.next(data));

        return firstValueFrom(
            this.translations$.pipe(filter(t => Object.keys(t).length > 0))
        ).then(() => undefined);
    }

    /** Translate a key. Falls back to the key itself if not found. */
    t(key: string): string {
        return this.subject.value[key] ?? key;
    }
}
