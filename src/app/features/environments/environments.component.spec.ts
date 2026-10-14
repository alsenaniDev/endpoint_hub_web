import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { EnvironmentsComponent } from './environments.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateService } from '../../core/services/translate.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { apiBase, organizationA, organizationB, settleAsync, testContext, testUser } from '../../core/services/organization.fixtures.spec';

describe('Workbench environments workspace', () => {
  let context: OrganizationContextService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [EnvironmentsComponent],
      providers: [
        provideRouter([{ path: 'workbench/environments', component: EnvironmentsComponent }]),
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
    await router.navigateByUrl('/workbench/environments');
  });

  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    localStorage.clear();
  });

  function system(id = 'system-a', name = 'Checkout API') {
    return {
      id, teamId: 'team-a', teamName: 'Platform', name, description: 'Payments',
      ownerName: 'Private owner', ownerEmail: 'owner@example.test', repositoryUrl: 'https://example.test/repo',
      environmentCount: 1, createdAt: '2026-10-01T00:00:00Z'
    };
  }

  function environment(id = 'environment-a', overrides: Record<string, unknown> = {}) {
    return {
      id, systemId: 'system-a', systemName: 'Checkout API', name: 'Production',
      environmentType: 'Production', swaggerUrl: 'https://private.example.test/swagger.json',
      baseUrl: 'https://private.example.test', isActive: true, endpointCount: 18,
      lastSyncedAt: '2026-10-05T10:00:00Z', createdAt: '2026-10-01T00:00:00Z',
      ...overrides
    };
  }

  function createWorkspace() {
    const fixture = TestBed.createComponent(EnvironmentsComponent);
    fixture.detectChanges();
    return fixture;
  }

  function respondToWorkspace(
    fixture: ReturnType<typeof createWorkspace>,
    systems = [system()],
    environments = [environment()]
  ): void {
    const systemsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/systems?`));
    expect(systemsRequest.request.method).toBe('GET');
    expect(systemsRequest.request.headers.get('X-Organization-Id')).toBe(organizationA.id);
    systemsRequest.flush({
      success: true, data: { items: systems, totalCount: systems.length, pageNumber: 1, pageSize: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
    });
    const environmentsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/environments?`));
    expect(environmentsRequest.request.method).toBe('GET');
    expect(environmentsRequest.request.headers.get('X-Organization-Id')).toBe(organizationA.id);
    environmentsRequest.flush({
      success: true, data: { items: environments, totalCount: environments.length, pageNumber: 1, pageSize: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
    });
    fixture.detectChanges();
  }

  it('renders environments in system context and selects a real environment with endpoint navigation', () => {
    const fixture = createWorkspace();
    respondToWorkspace(fixture, [system()], [
      environment(),
      environment('environment-b', { name: 'Staging', environmentType: 'Staging', endpointCount: 4 })
    ]);

    let element = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.selectedEnvironment()?.id).toBe('environment-a');
    expect(fixture.componentInstance.selectedSystem()?.name).toBe('Checkout API');
    expect(element.textContent).toContain('Checkout API');
    expect(element.textContent).toContain('Production');
    expect(element.textContent).toContain('18');
    expect(element.querySelector('a[href="/workbench/endpoints"]')).not.toBeNull();
    expect(element.querySelector('a[href="/workbench/systems"]')).not.toBeNull();

    fixture.componentInstance.selectEnvironment('environment-b');
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.selectedEnvironment()?.name).toBe('Staging');
    expect(element.textContent).toContain('4');
    expect(element.querySelector('.environment-option.selected')?.textContent).toContain('Staging');
  });

  it('shows creation and contextual actions only when the existing live permissions allow mutations', async () => {
    const fixture = createWorkspace();
    respondToWorkspace(fixture);
    expect((fixture.nativeElement as HTMLElement).querySelector('.environments-workbench-header .environment-button.primary')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.environment-detail-actions .sync')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.environment-detail-actions .danger')).not.toBeNull();

    const switched = context.selectOrganization(organizationB.id);
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true,
      data: {
        ...testContext(organizationB),
        organization: { ...organizationB, membership: { ...organizationB.membership, isReadOnly: true } },
        permissions: ['environments.view', 'systems.view', 'endpoints.view']
      }
    });
    await switched;
    const systemsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/systems?`));
    const environmentsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/environments?`));
    systemsRequest.flush({
      success: true, data: { items: [], totalCount: 0, pageNumber: 1, pageSize: 100, totalPages: 0, hasNextPage: false, hasPreviousPage: false }
    });
    environmentsRequest.flush({
      success: true, data: { items: [], totalCount: 0, pageNumber: 1, pageSize: 100, totalPages: 0, hasNextPage: false, hasPreviousPage: false }
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.environments-workbench-header .environment-button.primary')).toBeNull();
    expect(element.querySelector('.environment-detail-actions')).toBeNull();
  });

  it('clears prior organization data and reloads systems and environments in the new scope', async () => {
    const fixture = createWorkspace();
    respondToWorkspace(fixture);
    expect(fixture.componentInstance.selectedEnvironment()?.name).toBe('Production');

    const switched = context.selectOrganization(organizationB.id);
    expect(fixture.componentInstance.environments()).toEqual([]);
    expect(fixture.componentInstance.selectedEnvironmentId()).toBeNull();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Production');
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true,
      data: {
        ...testContext(organizationB),
        organization: { ...organizationB, membership: { ...organizationB.membership, isReadOnly: true } },
        permissions: ['environments.view', 'systems.view', 'endpoints.view']
      }
    });
    await switched;

    const systemsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/systems?`));
    const environmentsRequest = http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/environments?`));
    expect(systemsRequest.request.headers.get('X-Organization-Id')).toBe(organizationB.id);
    expect(environmentsRequest.request.headers.get('X-Organization-Id')).toBe(organizationB.id);
    systemsRequest.flush({
      success: true, data: { items: [system('system-b', 'Workspace B API')], totalCount: 1, pageNumber: 1, pageSize: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
    });
    environmentsRequest.flush({
      success: true, data: { items: [environment('environment-b', { systemId: 'system-b', systemName: 'Private system label', name: 'Private environment label' })], totalCount: 1, pageNumber: 1, pageSize: 100, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
    });
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('environment-b');
    expect(element.textContent).toContain('system-b');
    expect(element.textContent).not.toContain('Private environment label');
    expect(element.textContent).not.toContain('Private system label');
    expect(element.textContent).not.toContain('Private owner');
    expect(element.textContent).not.toContain('private.example.test');
    expect(element.querySelector('.environment-detail-actions')).toBeNull();
    expect(element.querySelector('.environment-search')).toBeNull();
  });

  it('shows explicit loading, error, and empty states without fabricated environments', () => {
    const failed = createWorkspace();
    expect(failed.componentInstance.loading()).toBeTrue();
    http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/systems?`)).flush({
      success: true, data: { items: [], totalCount: 0, pageNumber: 1, pageSize: 100, totalPages: 0, hasNextPage: false, hasPreviousPage: false }
    });
    http.expectOne(req => req.urlWithParams.startsWith(`${apiBase}/environments?`)).flush('Unavailable', {
      status: 503, statusText: 'Service Unavailable'
    });
    failed.detectChanges();
    expect(failed.componentInstance.environments()).toEqual([]);
    expect((failed.nativeElement as HTMLElement).querySelector('[role="alert"]')).not.toBeNull();

    const empty = createWorkspace();
    respondToWorkspace(empty, [], []);
    expect(empty.componentInstance.selectedEnvironment()).toBeNull();
    expect((empty.nativeElement as HTMLElement).textContent).toContain('environments.workbench.emptyTitle');
    expect((empty.nativeElement as HTMLElement).querySelector('.environment-detail')).toBeNull();
  });
});
