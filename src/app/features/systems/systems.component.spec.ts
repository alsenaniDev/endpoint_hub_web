import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { SystemsComponent } from './systems.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateService } from '../../core/services/translate.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { testUser, organizationA, organizationB, testContext, apiBase, settleAsync } from '../../core/services/organization.fixtures.spec';

describe('Workbench systems explorer', () => {
  let context: OrganizationContextService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [SystemsComponent],
      providers: [
        provideRouter([{ path: 'workbench/systems', component: SystemsComponent }]),
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
    await router.navigateByUrl('/workbench/systems');
  });

  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    localStorage.clear();
  });

  function system(id = 'system-a', overrides: Record<string, unknown> = {}) {
    return {
      id, teamId: 'team-a', teamName: 'Platform', name: 'Checkout API',
      description: 'Payment processing API', ownerName: 'Avery', repositoryUrl: 'https://example.test/repo',
      environmentCount: 1, createdAt: '2026-10-01T00:00:00Z', ...overrides
    };
  }

  function environment(id = 'environment-a', overrides: Record<string, unknown> = {}) {
    return {
      id, systemId: 'system-a', systemName: 'Checkout API', name: 'Production',
      environmentType: 'Production', swaggerUrl: 'https://api.test/swagger.json', baseUrl: 'https://api.test',
      isActive: true, endpointCount: 14, createdAt: '2026-10-01T00:00:00Z', ...overrides
    };
  }

  function createExplorer() {
    const fixture = TestBed.createComponent(SystemsComponent);
    fixture.detectChanges();
    return fixture;
  }

  function expectInitialSystems(fixture: ReturnType<typeof createExplorer>, items = [system()]) {
    const teamsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/teams?`));
    expect(teamsRequest.request.headers.get('X-Organization-Id')).toBe(organizationA.id);
    teamsRequest.flush({ success: true, data: { items: [], totalCount: 0, pageNumber: 1, pageSize: 100, totalPages: 0, hasNextPage: false, hasPreviousPage: false } });
    const systemsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/systems?`));
    expect(systemsRequest.request.headers.get('X-Organization-Id')).toBe(organizationA.id);
    systemsRequest.flush({ success: true, data: { items, totalCount: items.length, pageNumber: 1, pageSize: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false } });
    fixture.detectChanges();
  }

  it('shows actual system details, environment relationship, and endpoint totals', () => {
    const fixture = createExplorer();
    expectInitialSystems(fixture);
    const environmentsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/environments?`));
    expect(environmentsRequest.request.urlWithParams).toContain('systemId=system-a');
    expect(environmentsRequest.request.headers.get('X-Organization-Id')).toBe(organizationA.id);
    environmentsRequest.flush({
      success: true, data: { items: [environment()], totalCount: 1, pageNumber: 1, pageSize: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(fixture.componentInstance.selectedSystem()?.name).toBe('Checkout API');
    expect(fixture.componentInstance.selectedEndpointCount()).toBe(14);
    expect(text).toContain('Checkout API');
    expect(text).toContain('Production');
    expect(text).toContain('Payment processing API');
    expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/workbench/environments"]')).not.toBeNull();
  });

  it('clears selected-system and environment data when the active organization changes', async () => {
    const fixture = createExplorer();
    expectInitialSystems(fixture);
    http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/environments?`)).flush({
      success: true, data: { items: [environment()], totalCount: 1, pageNumber: 1, pageSize: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.relatedEnvironments()?.length).toBe(1);

    const switched = context.selectOrganization(organizationB.id);
    expect(fixture.componentInstance.systems()).toEqual([]);
    expect(fixture.componentInstance.relatedEnvironments()).toBeNull();
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: {
        ...testContext(organizationB),
        organization: {
          ...organizationB,
          membership: { ...organizationB.membership, isReadOnly: true }
        },
        permissions: ['systems.view', 'environments.view']
      }
    });
    await switched;

    const teamsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/teams?`));
    expect(teamsRequest.request.headers.get('X-Organization-Id')).toBe(organizationB.id);
    teamsRequest.flush({ success: true, data: { items: [], totalCount: 0, pageNumber: 1, pageSize: 100, totalPages: 0, hasNextPage: false, hasPreviousPage: false } });
    const systemsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/systems?`));
    expect(systemsRequest.request.headers.get('X-Organization-Id')).toBe(organizationB.id);
    systemsRequest.flush({ success: true, data: { items: [system('system-b', { name: 'Workspace B API' })], totalCount: 1, pageNumber: 1, pageSize: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false } });
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedSystem()?.name).toBe('Workspace B API');
    const view = fixture.nativeElement as HTMLElement;
    expect(view.textContent).toContain('system-b');
    expect(view.textContent).not.toContain('Workspace B API');
    expect(view.textContent).not.toContain('Avery');
    expect(view.querySelector('.system-detail-actions')).toBeNull();
    expect(view.querySelector('.systems-search')).toBeNull();
    const environmentRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/environments?`));
    environmentRequest.flush({
      success: true, data: { items: [environment('environment-b', { systemId: 'system-b', systemName: 'Workspace B API', name: 'Private environment' })], totalCount: 1, pageNumber: 1, pageSize: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Private environment');
  });

  it('presents system loading errors and an explicit empty state', () => {
    const failed = createExplorer();
    http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/teams?`)).flush({
      success: true, data: { items: [], totalCount: 0, pageNumber: 1, pageSize: 100, totalPages: 0, hasNextPage: false, hasPreviousPage: false }
    });
    http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/systems?`)).flush('Forbidden', {
      status: 403, statusText: 'Forbidden'
    });
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: testContext(organizationA)
    });
    failed.detectChanges();
    expect(failed.nativeElement.querySelector('[role="alert"]')).not.toBeNull();

    const empty = createExplorer();
    expectInitialSystems(empty, []);
    expect((empty.nativeElement as HTMLElement).textContent).toContain('systems.workbench.emptyTitle');
    expect(empty.componentInstance.selectedSystem()).toBeNull();
  });
});
