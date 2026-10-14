import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { workbenchLandingRoute } from '../../../core/authorization/workbench-navigation';

@Component({
  selector: 'app-organization-switcher',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  template: `
    <label class="switcher">
      <span>{{ 'org.active' | t }}</span>
      <select [ngModel]="context.activeOrganizationId() ?? ''"
        (ngModelChange)="switchOrganization($event)" [disabled]="context.loading()"
        [attr.aria-label]="('org.active' | t) + ': ' + selectedOrganizationName"
        [attr.title]="selectedOrganizationName">
        <option value="" disabled>{{ 'org.select' | t }}</option>
        <option *ngFor="let org of context.organizations()" [value]="org.id">
          {{ org.membership.isReadOnly ? org.id : org.name }} ({{ org.membership.isReadOnly ? ('org.structuralOnly' | t) : org.type }})
        </option>
      </select>
    </label>
    <a [routerLink]="settingsRoute">{{ 'org.settings' | t }}</a>
  `,
  styles: [`
    :host { display:flex; min-width:0; flex:1; align-items:center; flex-wrap:nowrap; gap:.75rem; }
    .switcher { display:flex; min-width:0; flex:1; align-items:center; gap:.5rem; }
    select { display:block; min-width:0; max-width:100%; width:clamp(8rem,18vw,20rem); overflow:hidden;
      padding:.4rem; background:var(--bg-surface); color:var(--text); text-overflow:ellipsis; white-space:nowrap; }
    @media (max-width:560px) {
      .switcher > span, :host > a { display:none; }
      select { width:100%; }
    }
  `]
})
export class OrganizationSwitcherComponent {
  readonly context = inject(OrganizationContextService);
  private readonly router = inject(Router);
  get selectedOrganizationName(): string {
    const organization = this.context.activeOrganization();
    return organization
      ? organization.membership.isReadOnly ? organization.id : organization.name
      : this.context.activeOrganizationId() ?? '';
  }

  get settingsRoute(): string {
    return this.router.url.startsWith('/workbench') ? '/workbench/settings/members' : '/organizations';
  }

  async switchOrganization(id: string): Promise<void> {
    if (id === this.context.activeOrganizationId() && this.context.ready()) return;
    const fromWorkbench = this.router.url.startsWith('/workbench');
    this.context.prepareOrganizationSwitch();
    const resetRoute = fromWorkbench ? '/workbench/settings/members' : '/organizations';
    if (!await this.router.navigate([resetRoute])) {
      this.context.invalidate('org.requestFailed');
      return;
    }
    const selected = await this.context.selectOrganization(id);
    if (selected && id === this.context.activeOrganizationId()) {
      const workbenchDestination = workbenchLandingRoute(
        this.context.canMutate(),
        permission => this.context.hasPermission(permission)
      );
      const destination = fromWorkbench
        ? workbenchDestination === '/access-denied' ? '/workbench/settings/members' : workbenchDestination
        : this.context.landingPath();
      await this.router.navigate([destination]);
    }
  }
}
