import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { workbenchLandingRoute } from '../../core/authorization/workbench-navigation';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './access-denied.component.html',
  styleUrls: ['./access-denied.component.scss']
})
export class AccessDeniedComponent {
  readonly organization = inject(OrganizationContextService);
  private readonly route = inject(ActivatedRoute);

  get returnRoute(): string {
    if (this.route.snapshot.queryParamMap.get('from') !== 'workbench' || !this.organization.ready()) {
      return '/organizations';
    }
    const destination = workbenchLandingRoute(
      this.organization.canMutate(),
      permission => this.organization.hasPermission(permission)
    );
    return destination === '/access-denied' ? '/workbench/settings/members' : destination;
  }
}
