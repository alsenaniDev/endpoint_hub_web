import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslateService } from '../services/translate.service';

/** Usage: {{ 'nav.dashboard' | t }} */
@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform, OnDestroy {
    private ts = inject(TranslateService);
    private cdr = inject(ChangeDetectorRef);
    private sub: Subscription;

    constructor() {
        // Re-render the view whenever translations reload (lang change or initial load)
        this.sub = this.ts.translations$.subscribe(() => this.cdr.markForCheck());
    }

    ngOnDestroy(): void {
        this.sub.unsubscribe();
    }

    transform(key: string): string {
        return this.ts.t(key);
    }
}
