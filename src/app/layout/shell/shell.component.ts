import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';
import { ThemeService } from '../../core/services/theme.service';
import { LangService } from '../../core/services/lang.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { OrganizationSwitcherComponent } from '../../shared/components/organization-switcher/organization-switcher.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, SidebarComponent, HeaderComponent, TranslatePipe, OrganizationSwitcherComponent],
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss']
})
export class ShellComponent {
  readonly organization = inject(OrganizationContextService);
  private readonly router = inject(Router);
  readonly trackRevision = (_: number, revision: number): number => revision;

  identityRoute(): boolean {
    return /^\/(start|organizations|profile|users|access-denied|invitations)(\/|$)/.test(this.router.url.split('?')[0]);
  }

  accessRoute(): boolean {
    return /^\/start(\/|$)/.test(this.router.url.split('?')[0]);
  }

  sidebarOpen = signal(false);
  sidebarCollapsed = signal(false);

  themeService = inject(ThemeService);
  langService = inject(LangService);
  private sanitizer = inject(DomSanitizer);

  themeIcon = computed<SafeHtml>(() => {
    if (this.themeService.theme() === 'dark') {
      return this.sanitizer.bypassSecurityTrustHtml(
        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>`
      );
    }
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>`
    );
  });
}
