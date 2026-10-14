import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { OrganizationContextService } from '../core/services/organization-context.service';
import { LangService } from '../core/services/lang.service';
import { ThemeService } from '../core/services/theme.service';
import { isWorkbenchItemAvailable, workbenchNavigation, WorkbenchNavItem } from '../core/authorization/workbench-navigation';
import { NotificationBellComponent } from '../shared/components/notification-bell/notification-bell.component';
import { OrganizationSwitcherComponent } from '../shared/components/organization-switcher/organization-switcher.component';
import { TranslatePipe } from '../core/pipes/translate.pipe';
import { NotificationService } from '../core/services/notification.service';

@Component({
  selector: 'app-workbench-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    NotificationBellComponent,
    OrganizationSwitcherComponent,
    TranslatePipe
  ],
  templateUrl: './workbench-shell.component.html',
  styleUrls: ['./workbench-shell.component.scss']
})
export class WorkbenchShellComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly organization = inject(OrganizationContextService);
  readonly lang = inject(LangService);
  readonly theme = inject(ThemeService);
  private readonly notificationService = inject(NotificationService);
  readonly navigation = workbenchNavigation;
  readonly mobileNavOpen = signal(false);
  readonly trackRevision = (_index: number, revision: number): number => revision;

  ngOnInit(): void {
    this.notificationService.init(false);
  }

  canVisit(item: WorkbenchNavItem): boolean {
    return this.organization.ready() &&
      isWorkbenchItemAvailable(item, key => this.organization.hasPermission(key), this.organization.canMutate());
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }
}
