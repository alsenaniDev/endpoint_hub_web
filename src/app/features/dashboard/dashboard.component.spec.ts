import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateService } from '../../core/services/translate.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { testUser, organizationA, organizationB, testContext, apiBase, settleAsync } from '../../core/services/organization.fixtures.spec';

describe('Workbench organization overview', () => {
  let context: OrganizationContextService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([{ path: 'workbench/overview', component: DashboardComponent }]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
    context = TestBed.inject(OrganizationContextService);
    TestBed.inject(AuthService).currentUser.set(testUser);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    const initialized = context.initialize(testUser.userId);
    http.expectOne(`${apiBase}/organizations`).flush({
      success: true, data: { organizations: [organizationA, organizationB], canManageUsers: false }
    });
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: testContext(organizationA)
    });
    await initialized;
    await router.navigateByUrl('/workbench/overview');
  });

  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    localStorage.clear();
  });

  function stats(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      totalTeams: 2,
      totalSystems: 3,
      totalEnvironments: 4,
      totalEndpoints: 24,
      uniqueEndpoints: 12,
      newEndpoints: 2,
      modifiedEndpoints: 1,
      deletedEndpoints: 0,
      brokenSwaggerUrls: 1,
      endpointsByEnvironment: [{
        environmentId: 'environment-a', environmentName: 'Production',
        systemId: 'system-a', systemName: 'Payments API', totalEndpoints: 12,
        swaggerSources: []
      }],
      recentSyncs: [{
        environmentId: 'environment-a', environmentName: 'Production',
        systemName: 'Payments API', swaggerSourceLabel: 'Main API',
        status: 'Success', syncedAt: '2026-10-01T12:00:00Z'
      }],
      ...overrides
    };
  }

  function createOverview() {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders real resource, endpoint-change, and synchronization data with only authorized quick links', () => {
    const fixture = createOverview();
    expect(fixture.componentInstance.workbench).toBeTrue();
    const request = http.expectOne(`${apiBase}/dashboard/stats`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-Organization-Id')).toBe(organizationA.id);
    request.flush({ success: true, data: stats() });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#overview-title')?.textContent).toContain('Workspace A');
    expect(element.textContent).toContain('Payments API');
    expect(element.textContent).toContain('Production');
    expect(element.textContent).toContain('Main API');
    expect(element.textContent).toContain('2');
    expect(element.textContent).not.toContain('health score');
    expect(Array.from(element.querySelectorAll('a')).some(link => link.getAttribute('href') === '/workbench/endpoints')).toBeTrue();
    expect(Array.from(element.querySelectorAll('a')).some(link => link.getAttribute('href') === '/workbench/systems')).toBeTrue();
    expect(Array.from(element.querySelectorAll('a')).some(link => link.getAttribute('href') === '/workbench/teams')).toBeTrue();
    expect(Array.from(element.querySelectorAll('a')).some(link => link.getAttribute('href') === '/workbench/governance')).toBeFalse();
    expect(fixture.componentInstance.environmentRoute()).toBe('/workbench/environments');
  });

  it('clears the previous organization overview during a switch and reloads scoped stats', async () => {
    const fixture = createOverview();
    http.expectOne(`${apiBase}/dashboard/stats`).flush({ success: true, data: stats() });
    fixture.detectChanges();
    expect(fixture.componentInstance.stats()?.totalSystems).toBe(3);

    const switched = context.selectOrganization(organizationB.id);
    expect(fixture.componentInstance.stats()).toBeNull();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Payments API');

    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: { ...testContext(organizationB), organization: organizationB }
    });
    await switched;
    const nextStats = http.expectOne(`${apiBase}/dashboard/stats`);
    expect(nextStats.request.headers.get('X-Organization-Id')).toBe(organizationB.id);
    nextStats.flush({ success: true, data: stats({ totalSystems: 1, endpointsByEnvironment: [], recentSyncs: [] }) });
    fixture.detectChanges();
    expect(fixture.componentInstance.stats()?.totalSystems).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Payments API');
  });

  it('shows API errors instead of presenting them as a successful empty overview', () => {
    const fixture = createOverview();
    expect(fixture.componentInstance.loading()).toBeTrue();
    http.expectOne(`${apiBase}/dashboard/stats`).flush('Unavailable', {
      status: 503, statusText: 'Service Unavailable'
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.errorKey()).toBe('org.requestFailed');
    expect(fixture.componentInstance.stats()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders explicit empty states when the real API returns no resources or sync records', () => {
    const fixture = createOverview();
    http.expectOne(`${apiBase}/dashboard/stats`).flush({
      success: true,
      data: stats({
        totalTeams: 0, totalSystems: 0, totalEnvironments: 0, totalEndpoints: 0,
        uniqueEndpoints: 0, newEndpoints: 0, modifiedEndpoints: 0, deletedEndpoints: 0,
        brokenSwaggerUrls: 0, endpointsByEnvironment: [], recentSyncs: []
      })
    });
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('overview.noResources');
    expect(text).toContain('dashboard.noSyncs');
  });
});
