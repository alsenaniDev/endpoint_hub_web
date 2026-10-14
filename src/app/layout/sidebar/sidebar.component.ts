import { Component, inject, computed, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AuthService } from '../../core/services/auth.service';
import { ThemeService } from '../../core/services/theme.service';
import { LangService } from '../../core/services/lang.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { canEnterDashboard, managementPermissions } from '../../core/authorization/organization-navigation';

interface NavItem {
  labelKey: string;
  icon: SafeHtml;
  route: string;
  isBeta?: boolean;
  isExternal?: boolean;
  permissionKey?: string;
}

const navigationPermissions: Readonly<Record<string, string>> = {
  '/dashboard': 'endpoints.view', '/teams': 'teams.view', '/systems': 'systems.view',
  '/environments': 'environments.view', '/endpoints': 'endpoints.view',
  '/auth-profiles': 'authprofiles.view', '/embedded-test': 'endpoints.run'
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  @Input() mobileOpen = false;
  @Output() closeSidebar = new EventEmitter<void>();
  @Output() collapsedChange = new EventEmitter<boolean>();

  auth = inject(AuthService);
  organization = inject(OrganizationContextService);
  theme = inject(ThemeService);
  lang = inject(LangService);
  private sanitizer = inject(DomSanitizer);
  collapsed = false;

  /** True when UI is in RTL mode */
  isRTL = computed(() => this.lang.lang() === 'ar');

  /** Arrow direction for profile link — flips in RTL */
  profileArrow = computed(() => this.lang.lang() === 'ar' ? '←' : '→');

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    this.collapsedChange.emit(this.collapsed);
  }

  get userInitial(): string {
    return this.auth.currentUser()?.username?.[0]?.toUpperCase() ?? 'U';
  }

  private svg(raw: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(raw);
  }

  navItems: NavItem[] = [
    { labelKey: 'nav.management', icon: 'ID', route: '/management' },
    { labelKey: 'nav.dashboard', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>`), isBeta: false, route: '/dashboard' },
    { labelKey: 'nav.teams', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="5.5" cy="5" r="2.2"/><circle cx="10.5" cy="5" r="2.2"/><path d="M1 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke-linecap="round"/><path d="M10.5 9c2 0 3.5 1 4 3" stroke-linecap="round"/></svg>`), isBeta: false, route: '/teams' },
    { labelKey: 'nav.users', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="4.5" r="2.5"/><path d="M1 14c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke-linecap="round"/></svg>`), isBeta: false, route: '/users', permissionKey: 'users.manage' },
    { labelKey: 'nav.systems', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1.5" y="2" width="13" height="10" rx="1.5"/><path d="M5 15h6M8 12v3" stroke-linecap="round"/></svg>`), isBeta: false, route: '/systems' },
    { labelKey: 'nav.environments', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="8" r="6.5"/><ellipse cx="8" cy="8" rx="3" ry="6.5"/><path d="M1.5 8h13"/></svg>`), isBeta: false, route: '/environments' },
    { labelKey: 'nav.endpoints', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 4h10M3 8h7M3 12h4" stroke-linecap="round"/></svg>`), isBeta: false, route: '/endpoints' },
    { labelKey: 'nav.swaggerSync', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 8a6 6 0 0 1 9.9-4.5L14 2" stroke-linecap="round"/><path d="M14 8a6 6 0 0 1-9.9 4.5L2 14" stroke-linecap="round"/><path d="M14 2v3h-3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 14v-3h3" stroke-linecap="round" stroke-linejoin="round"/></svg>`), isBeta: false, route: '/swagger-sync', permissionKey: 'swaggersync.view' },
    { labelKey: 'nav.authProfiles', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke-linecap="round"/></svg>`), isBeta: false, route: '/auth-profiles' },
    { labelKey: 'nav.embeddedTest', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 2l-4 6 4 6" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 2l4 6-4 6" stroke-linecap="round" stroke-linejoin="round"/><line x1="5.5" y1="8" x2="10.5" y2="8" stroke-linecap="round"/></svg>`), isBeta: false, route: '/embedded-test' },
    { labelKey: 'nav.governance', icon: this.svg(`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 1l1.5 3.5L13 5l-2.5 2.5.5 3.5L8 9.5 5 11l.5-3.5L3 5l3.5-.5L8 1z" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 14h12" stroke-linecap="round"/></svg>`), isBeta: true, route: '/governance', permissionKey: 'governance.view' },
    { labelKey: 'User Guide', icon: '📖', isBeta: false, route: '/docs/USER_GUIDE.html', isExternal: true },
  ];

  visible(item: NavItem): boolean {
    if (item.route === '/management') {
      return this.organization.canMutate() && managementPermissions.some(key => this.auth.hasPermission(key));
    }
    if (item.route === '/dashboard') return canEnterDashboard(key => this.auth.hasPermission(key));
    const permission = item.permissionKey ?? navigationPermissions[item.route];
    return !permission || this.auth.hasPermission(permission);
  }
}
