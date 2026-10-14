import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

@Component({
  selector: 'app-invitation-accept',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <section style="padding:1.5rem">
      <h1>{{ 'org.acceptInvitation' | t }}</h1>
      <p role="alert">{{ 'org.acceptUnsupported' | t }}</p>
      <p>{{ 'org.invitationStatesUnsupported' | t }}</p>
      <a routerLink="/organizations">{{ 'org.settings' | t }}</a>
    </section>
  `
})
export class InvitationAcceptComponent {}
