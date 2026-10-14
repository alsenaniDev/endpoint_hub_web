import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { OrganizationContextService } from '../core/services/organization-context.service';
import { workbenchLandingRoute } from '../core/authorization/workbench-navigation';

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `<p class="landing-status" role="status">Opening your authorized workspace…</p>`,
  styles: [`.landing-status { margin: 0; color: var(--wb-readable-muted); }`]
})
export class WorkbenchLandingComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly organization = inject(OrganizationContextService);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const user = this.auth.currentUser();
    if (!user || !this.organization.ready()) return;
    const hasPermission = (key: string) => this.organization.hasPermission(key);
    const destination = workbenchLandingRoute(
      this.organization.canMutate(),
      hasPermission
    );
    await this.router.navigateByUrl(destination, { replaceUrl: true });
  }
}
