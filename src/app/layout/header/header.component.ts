import { Component, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ThemeService } from '../../core/services/theme.service';
import { LangService } from '../../core/services/lang.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { NotificationBellComponent } from '../../shared/components/notification-bell/notification-bell.component';
import { NotificationService } from '../../core/services/notification.service';
import { OrganizationSwitcherComponent } from '../../shared/components/organization-switcher/organization-switcher.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, TranslatePipe, NotificationBellComponent, OrganizationSwitcherComponent],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})

export class HeaderComponent implements OnInit {
  themeService = inject(ThemeService);
  langService = inject(LangService);
  private sanitizer = inject(DomSanitizer);
  private notifService = inject(NotificationService);

  themeIcon = computed<SafeHtml>(() => {
    if (this.themeService.theme() === 'dark') {
      // Sun — switch to light
      return this.sanitizer.bypassSecurityTrustHtml(
        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>`
      );
    }
    // Moon — switch to dark
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>`
    );
  });

  ngOnInit(): void {
    this.notifService.init();
  }
}
