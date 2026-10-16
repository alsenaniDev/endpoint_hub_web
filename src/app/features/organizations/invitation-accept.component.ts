import { CommonModule, Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorKey } from '../../core/models/organization';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

@Component({
  selector: 'app-invitation-accept',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <section class="invitation-accept" aria-labelledby="invitation-title">
      <h1 id="invitation-title">{{ 'org.acceptInvitation' | t }}</h1>
      <p *ngIf="loading()" role="status">{{ 'common.loading' | t }}</p>
      <p *ngIf="error()" role="alert">{{ error()! | t }}</p>
      <p *ngIf="outcome()" role="status">{{ outcome()! | t }}</p>
      <p *ngIf="!token() && !outcome() && !loading()" role="note">{{ 'org.invitationTokenMissing' | t }}</p>
      <button type="button" (click)="accept()" [disabled]="!token() || loading() || !!outcome()">
        {{ 'org.acceptInvitationAction' | t }}
      </button>
      <a href="/organizations">{{ 'org.settings' | t }}</a>
    </section>
  `
})
export class InvitationAcceptComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly context = inject(OrganizationContextService);

  readonly token = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly outcome = signal<string | null>(null);

  constructor() {
    const supplied = this.route.snapshot.queryParamMap.get('token');
    if (supplied && supplied.length <= 256 && supplied.trim()) this.token.set(supplied);
    // Keep the secret only in component memory; remove it from the visible URL/history immediately.
    if (supplied !== null) this.location.replaceState(this.router.url.split('?')[0]);
  }

  async accept(): Promise<void> {
    const token = this.token();
    if (!token || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await firstValueFrom(this.context.acceptInvitation(token));
      if (!response.success || !response.data) throw new Error('org.requestFailed');
      const outcomeKey: Record<string, string> = {
        Joined: 'org.invitationJoined',
        AlreadyMember: 'org.invitationAlreadyMember',
        Rejoined: 'org.invitationRejoined'
      };
      this.outcome.set(outcomeKey[response.data.outcome] ?? 'org.invitationAccepted');
      this.token.set(null);
      // Refresh discovery but do not switch away from an existing active organization.
      await this.context.refreshDiscoveryWithoutSwitching(false);
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        this.error.set(apiErrorKey(error.status, error.error?.message));
      } else {
        this.error.set(error instanceof Error && error.message.startsWith('org.')
          ? error.message : 'org.requestFailed');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
