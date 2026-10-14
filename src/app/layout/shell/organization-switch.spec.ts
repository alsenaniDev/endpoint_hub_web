import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { ShellComponent } from './shell.component';
import { SystemsComponent } from '../../features/systems/systems.component';
import { EndpointListComponent } from '../../features/endpoints/endpoint-list/endpoint-list.component';
import { EmbeddedTestComponent } from '../../features/embedded-test/embedded-test.component';
import { GovernanceStandardsComponent } from '../../features/governance/governance-standards/governance-standards.component';
import { TeamsComponent } from '../../features/teams/teams.component';
import { EndpointRunnerComponent } from '../../features/endpoints/endpoint-runner/endpoint-runner.component';
import { WorkbenchShellComponent } from '../../workbench/workbench-shell.component';
import { SwaggerSyncComponent } from '../../features/swagger-sync/swagger-sync.component';
import { OrganizationsComponent } from '../../features/organizations/organizations.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateService } from '../../core/services/translate.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { testUser, organizationA, organizationB, testContext, apiBase, settleAsync } from '../../core/services/organization.fixtures.spec';

describe('Real shell destroys tenant feature caches across A to B', () => {
  let context: OrganizationContextService;
  let http: HttpTestingController;
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ShellComponent, WorkbenchShellComponent],
      providers: [
        provideRouter([{ path: 'workbench', component: WorkbenchShellComponent, children: [
          { path: 'endpoints', component: EndpointListComponent },
          { path: 'endpoints/:id/run', component: EndpointRunnerComponent },
          { path: 'swagger', component: SwaggerSyncComponent },
          { path: 'governance', component: GovernanceStandardsComponent },
          { path: 'settings/members', component: OrganizationsComponent }
        ] }, { path: '', component: ShellComponent, children: [
          { path: 'systems', component: SystemsComponent },
          { path: 'endpoints', component: EndpointListComponent },
          { path: 'embedded-test', component: EmbeddedTestComponent },
          { path: 'governance', component: GovernanceStandardsComponent },
          { path: 'teams', component: TeamsComponent },
          { path: 'endpoints/:id/run', component: EndpointRunnerComponent }
        ] }]),
        provideNoopAnimations(), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
    context = TestBed.inject(OrganizationContextService);
    TestBed.inject(AuthService).currentUser.set(testUser);
    http = TestBed.inject(HttpTestingController);
    const initialized = context.initialize(testUser.userId);
    http.expectOne(`${apiBase}/organizations`).flush({
      success: true, data: { organizations: [organizationA, organizationB], canManageUsers: false }
    });
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: testContext(organizationA) });
    await initialized;
  });
  afterEach(() => { http.verify({ ignoreCancelled: true }); localStorage.clear(); });

  function flushFeature(label: string, orgId: string) {
    for (const request of http.match(req => req.url.startsWith(apiBase) && req.method === 'GET')) {
      if (request.cancelled) continue;
      expect(request.request.headers.get('X-Organization-Id')).toBe(orgId);
      const url = request.request.url;
      let data: unknown;
      if (url.endsWith('/notifications')) data = [{ id: label, message: `${label} notice`, isRead: false }];
      else if (url.endsWith('/current/members')) data = [{
        id: label, userId: label, username: label, fullName: label, state: 'Active',
        role: { id: label, name: label, description: label }
      }];
      else if (url.endsWith('/current/roles')) data = [{ id: label, name: label, description: label }];
      else if (url.endsWith('/swaggersync/status')) data = [{
        environmentId: label, environmentName: label, systemName: label, swaggerSourceId: `${label}-source`,
        lastStatus: 'Success', totalEndpoints: 1
      }];
      else if (url.endsWith('/swagger-sources')) data = [{
        id: `${label}-source`, environmentId: label, label, url: 'https://example.invalid/document.json',
        baseUrl: 'https://example.invalid', isActive: true, createdAt: '2026-09-01T12:00:00Z'
      }];
      else if (url.endsWith('/embeddedtests')) data = [{ id: label, name: label, method: 'GET', url: 'https://example.invalid', token: '' }];
      else if (url.endsWith('/endpoints')) data = { items: [{
        id: label, path: `/${label}`, method: 'GET', systemId: label, systemName: label,
        teamId: label, teamName: label, environmentId: label, environmentName: label,
        tag: 'test', changeStatus: 'Unchanged', isFavorite: false
      }], totalCount: 1 };
      else if (/\/endpoints\/[^/]+$/.test(url)) data = {
        id: label, path: `/${label}`, method: 'GET', tag: 'test', isDeprecated: false,
        changeStatus: 'Unchanged', environmentId: label, environmentName: label,
        baseUrl: 'https://example.invalid', systemId: label, systemName: label,
        teamId: label, teamName: label, parameters: [], headers: [], requestBodies: [], responses: []
      };
      else if (url.includes('/requestrunner/history/')) data = {
        items: [], totalCount: 0, pageNumber: 1, pageSize: 20, totalPages: 0,
        hasNextPage: false, hasPreviousPage: false
      };
      else if (url.endsWith('/systems')) data = { items: [{
        id: label, name: label, teamName: label, ownerName: label, environmentCount: 0
      }], totalCount: 1 };
      else if (url.endsWith('/teams')) data = {
        items: [{
          id: label, name: label, description: `${label} description`,
          contactEmail: `${label}@example.test`, slackChannel: `#${label}`,
          systemCount: 1, createdAt: '2026-09-01T12:00:00Z'
        }],
        totalCount: 1, pageNumber: 1, pageSize: 20, totalPages: 1,
        hasNextPage: false, hasPreviousPage: false
      };
      else if (url.endsWith('/standards')) data = { items: [{
        id: label, name: label, isActive: true, ruleCount: 0, assignmentCount: 0
      }], totalCount: 1 };
      else if (/\/governance\/standards\/[^/]+$/.test(url)) data = {
        id: label, name: label, description: label, isActive: true, ruleCount: 1, assignmentCount: 0,
        createdAt: '2026-09-01T12:00:00Z'
      };
      else if (url.endsWith('/rules')) data = [{
        id: label, standardId: label, ruleName: label, ruleType: 'Regex', target: 'Path',
        severity: 'Error', isActive: true, errorMessage: label, createdAt: '2026-09-01T12:00:00Z'
      }];
      else if (url.endsWith('/assignments')) data = [];
      else data = { items: [], totalCount: 0 };
      request.flush({ success: true, data });
    }
  }

  for (const feature of ['systems', 'endpoints', 'endpoints/test-id/run', 'workbench/endpoints',
    'workbench/endpoints/test-id/run', 'workbench/swagger', 'workbench/governance', 'workbench/settings/members', 'embedded-test', 'governance', 'teams']) {
    it(`removes all A ${feature} data even when B context resolves before a change-detection tick`, async () => {
      const harness = await RouterTestingHarness.create(`/${feature}`);
      flushFeature('A_PRIVATE_DATA', organizationA.id);
      harness.detectChanges();
      flushFeature('A_PRIVATE_DATA', organizationA.id);
      harness.detectChanges();
      flushFeature('A_PRIVATE_DATA', organizationA.id);
      harness.detectChanges();
      expect(harness.fixture.nativeElement.textContent).toContain('A_PRIVATE_DATA');
      if (feature === 'embedded-test') {
        expect((harness.fixture.nativeElement as HTMLElement).querySelector('.run-btn')).toBeNull();
      }
      const previousRevision = context.revision();
      const switched = context.selectOrganization(organizationB.id);
      // Resolve immediately: the epoch key must destroy the old component even without observing loading=false/true.
      http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: testContext(organizationB) });
      await switched;
      expect(context.revision()).toBeGreaterThan(previousRevision);
      harness.detectChanges();
      expect(harness.fixture.nativeElement.textContent).not.toContain('A_PRIVATE_DATA');
      flushFeature('B_PRIVATE_DATA', organizationB.id);
      harness.detectChanges();
      flushFeature('B_PRIVATE_DATA', organizationB.id);
      harness.detectChanges();
      flushFeature('B_PRIVATE_DATA', organizationB.id);
      harness.detectChanges();
      expect(harness.fixture.nativeElement.textContent).toContain('B_PRIVATE_DATA');
      expect(harness.fixture.nativeElement.textContent).not.toContain('A_PRIVATE_DATA');
    });
  }
});
