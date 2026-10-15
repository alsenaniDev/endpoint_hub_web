import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { LangService } from '../core/services/lang.service';
import { NotificationService } from '../core/services/notification.service';
import { OrganizationContextService } from '../core/services/organization-context.service';
import { ThemeService } from '../core/services/theme.service';
import { TranslateService } from '../core/services/translate.service';
import { WorkbenchShellComponent } from './workbench-shell.component';

const labels: Record<'en' | 'ar', Record<string, string>> = {
  en: {
    'org.active': 'Active organization',
    'org.settings': 'Organization settings',
    'org.select': 'Select an organization',
    'org.noMembership': 'No active organization membership.',
    'common.loading': 'Loading...',
    'sidebar.logOut': 'Sign out',
    'workbench.brandLabel': 'Endpoints Hub workbench',
    'workbench.navigation': 'Workbench navigation',
    'workbench.organizationWorkspace': 'Organization workspace',
    'workbench.toggleNavigation': 'Toggle navigation',
    'workbench.closeNavigation': 'Close navigation',
    'workbench.nav.overview': 'Overview',
    'workbench.nav.teams': 'Teams',
    'workbench.nav.systems': 'Systems',
    'workbench.nav.environments': 'Environments',
    'workbench.nav.endpoints': 'Endpoints',
    'workbench.nav.swagger': 'Swagger',
    'workbench.nav.governance': 'Governance',
    'workbench.nav.notifications': 'Notifications',
    'workbench.nav.settings': 'Settings',
    'workbench.displayPreferences': 'Display preferences',
    'workbench.theme.light': 'Light',
    'workbench.theme.dark': 'Dark',
    'header.switchToAr': 'Switch to Arabic',
    'header.switchToEn': 'Switch to English',
    'header.switchToDark': 'Switch to Dark mode',
    'header.switchToLight': 'Switch to Light mode'
  },
  ar: {
    'org.active': 'المؤسسة النشطة',
    'org.settings': 'إعدادات المؤسسة',
    'org.select': 'اختر مؤسسة',
    'org.noMembership': 'لا توجد عضوية نشطة.',
    'common.loading': 'جارٍ التحميل...',
    'sidebar.logOut': 'تسجيل الخروج',
    'workbench.brandLabel': 'مساحة عمل Endpoints Hub',
    'workbench.navigation': 'التنقل في مساحة العمل',
    'workbench.organizationWorkspace': 'مساحة عمل المؤسسة',
    'workbench.toggleNavigation': 'فتح أو إغلاق قائمة التنقل',
    'workbench.closeNavigation': 'إغلاق قائمة التنقل',
    'workbench.nav.overview': 'نظرة عامة',
    'workbench.nav.teams': 'الفرق',
    'workbench.nav.systems': 'الأنظمة',
    'workbench.nav.environments': 'البيئات',
    'workbench.nav.endpoints': 'نقاط النهاية',
    'workbench.nav.swagger': 'Swagger',
    'workbench.nav.governance': 'الحوكمة',
    'workbench.nav.notifications': 'الإشعارات',
    'workbench.nav.settings': 'الإعدادات',
    'workbench.displayPreferences': 'تفضيلات العرض',
    'workbench.theme.light': 'فاتح',
    'workbench.theme.dark': 'داكن',
    'header.switchToAr': 'التبديل إلى العربية',
    'header.switchToEn': 'التبديل إلى الإنجليزية',
    'header.switchToDark': 'التبديل إلى الوضع الداكن',
    'header.switchToLight': 'التبديل إلى الوضع الفاتح'
  }
};

describe('WorkbenchShellComponent localization', () => {
  let fixture: ComponentFixture<WorkbenchShellComponent>;
  let lang: LangService;
  let theme: ThemeService;
  let organizationReady: ReturnType<typeof signal<boolean>>;
  let organizationLoading: ReturnType<typeof signal<boolean>>;
  let organizationError: ReturnType<typeof signal<string | null>>;
  const originalDir = document.documentElement.dir;
  const originalLang = document.documentElement.lang;

  beforeEach(async () => {
    organizationReady = signal(true);
    organizationLoading = signal(false);
    organizationError = signal<string | null>(null);
    localStorage.removeItem('endpoints-hub-lang');
    localStorage.removeItem('endpoints-hub-theme');
    await TestBed.configureTestingModule({
      imports: [WorkbenchShellComponent],
      providers: [
        provideRouter([]),
        LangService,
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({ username: 'qa-user' }),
            logout: jasmine.createSpy('logout')
          }
        },
        {
          provide: OrganizationContextService,
          useValue: {
            ready: organizationReady,
            revision: () => 0,
            activeOrganizationId: signal('org-a'),
            activeOrganization: signal({
              id: 'org-a',
              name: 'Workspace',
              type: 'Shared',
              membership: { isReadOnly: false }
            }),
            organizations: signal([{
              id: 'org-a',
              name: 'Workspace',
              type: 'Shared',
              membership: { isReadOnly: false }
            }]),
            loading: organizationLoading,
            error: organizationError,
            membership: () => ({ role: { name: 'Owner' } }),
            hasPermission: () => true,
            canMutate: () => true,
            prepareOrganizationSwitch: jasmine.createSpy('prepareOrganizationSwitch'),
            selectOrganization: jasmine.createSpy('selectOrganization').and.resolveTo(true)
          }
        },
        {
          provide: NotificationService,
          useValue: {
            init: jasmine.createSpy('init'),
            notifications: signal([]),
            unreadCount: signal(0),
            toasts: signal([]),
            realtimeError: signal(null),
            errorKey: signal(null),
            canMutate: signal(true),
            markAllRead: jasmine.createSpy('markAllRead'),
            retryRealtime: jasmine.createSpy('retryRealtime'),
            dismissToast: jasmine.createSpy('dismissToast'),
            markRead: jasmine.createSpy('markRead')
          }
        },
        {
          provide: TranslateService,
          useFactory: (language: LangService) => ({
            t: (key: string) => labels[language.lang()][key] ?? key,
            translations$: of({})
          }),
          deps: [LangService]
        }
      ]
    }).compileComponents();
    lang = TestBed.inject(LangService);
    theme = TestBed.inject(ThemeService);
    fixture = TestBed.createComponent(WorkbenchShellComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.removeItem('endpoints-hub-lang');
    localStorage.removeItem('endpoints-hub-theme');
    document.documentElement.dir = originalDir;
    document.documentElement.lang = originalLang;
  });

  it('keeps shared navigation labels unchanged in English', () => {
    const links = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.primary-nav .nav-link')]
      .map(link => link.textContent?.trim().replace(/\s+/g, ' '));
    expect(links).toEqual([
      'Overview', 'Teams', 'Systems', 'Environments', 'Endpoints',
      'Swagger', 'Governance', 'Notifications', 'Settings'
    ]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.menu-button')?.getAttribute('aria-label'))
      .toBe('Toggle navigation');
  });

  it('switches theme and language through the existing services and persists both preferences', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const themeButton = element.querySelector('.shell-preference-button[aria-label="Switch to Dark mode"]') as HTMLButtonElement;
    const languageButton = element.querySelector('.shell-preference-button[aria-label="Switch to Arabic"]') as HTMLButtonElement;

    expect(themeButton).toBeTruthy();
    expect(languageButton).toBeTruthy();
    expect(theme.theme()).toBe('light');
    expect(lang.lang()).toBe('en');

    themeButton.click();
    fixture.detectChanges();
    expect(theme.theme()).toBe('dark');
    expect(document.body.classList.contains('dark-mode')).toBeTrue();
    expect(localStorage.getItem('endpoints-hub-theme')).toBe('dark');

    (element.querySelector('.shell-preference-button[aria-label="Switch to Light mode"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(theme.theme()).toBe('light');
    expect(document.body.classList.contains('dark-mode')).toBeFalse();
    expect(localStorage.getItem('endpoints-hub-theme')).toBe('light');

    languageButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(lang.lang()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('endpoints-hub-lang')).toBe('ar');

    (element.querySelector('.shell-preference-button[aria-label="التبديل إلى الإنجليزية"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(lang.lang()).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(localStorage.getItem('endpoints-hub-lang')).toBe('en');
  });

  it('renders translated Arabic navigation and shared chrome in RTL, including the mobile drawer', async () => {
    lang.lang.set('ar');
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(getComputedStyle(element.querySelector('.workbench-shell')!).direction).toBe('ltr');
    expect(getComputedStyle(element.querySelector('.workbench-sidebar')!).direction).toBe('rtl');
    expect(getComputedStyle(element.querySelector('.workbench-main')!).direction).toBe('rtl');
    expect(getComputedStyle(element.querySelector('.context-bar')!).direction).toBe('rtl');
    expect(getComputedStyle(element.querySelector('.primary-nav')!).direction).toBe('rtl');
    expect([...element.querySelectorAll('.primary-nav .nav-link')]
      .map(link => link.textContent?.trim().replace(/\s+/g, ' '))).toEqual([
        'نظرة عامة', 'الفرق', 'الأنظمة', 'البيئات', 'نقاط النهاية',
        'Swagger', 'الحوكمة', 'الإشعارات', 'الإعدادات'
      ]);
    expect(element.querySelector('.primary-nav')?.getAttribute('aria-label')).toBe('مساحة عمل المؤسسة');
    expect(element.querySelector('.menu-button')?.getAttribute('aria-label')).toBe('فتح أو إغلاق قائمة التنقل');
    (element.querySelector('.menu-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('.workbench-sidebar')?.classList.contains('mobile-open')).toBeTrue();
    expect(element.querySelector('.mobile-scrim')?.getAttribute('aria-label')).toBe('إغلاق قائمة التنقل');
    expect(element.querySelector('.drawer-close-button')?.getAttribute('aria-label')).toBe('إغلاق قائمة التنقل');
    (element.querySelector('.drawer-close-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('.workbench-sidebar')?.classList.contains('mobile-open')).toBeFalse();
  });

  it('hides Workbench route content without an organization and offers the existing selection flow', () => {
    organizationReady.set(false);
    organizationLoading.set(false);
    organizationError.set('org.noMembership');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('router-outlet')).toBeNull();
    expect(element.querySelector('.workbench-context-state [role="alert"]')?.textContent)
      .toContain('No active organization membership.');
    expect(element.querySelector('.workbench-context-state a')?.getAttribute('href')).toBe('/organizations');
  });
});
