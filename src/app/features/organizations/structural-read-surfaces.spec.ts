import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { TeamsComponent } from '../teams/teams.component';
import { SystemsComponent } from '../systems/systems.component';
import { EnvironmentsComponent } from '../environments/environments.component';
import { SwaggerSyncComponent } from '../swagger-sync/swagger-sync.component';
import { OrganizationsComponent } from './organizations.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateService } from '../../core/services/translate.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { apiBase, organizationA, testUser, settleAsync } from '../../core/services/organization.fixtures.spec';

describe('Viewer structural directories and explicit read failures', () => {
  let http: HttpTestingController;
  let context: OrganizationContextService;
  const permissions = ['teams.view', 'systems.view', 'environments.view', 'endpoints.view', 'swaggersync.view', 'governance.view'];
  const organization = { ...organizationA, name: '[restricted]', type: '[restricted]', slug: '[restricted]',
    membership: { ...organizationA.membership, isReadOnly: true,
      role: { ...organizationA.membership.role, name: '[restricted]' } } };
  const resourceId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const cases: { name: string; path: string; create: () => ComponentFixture<unknown> }[] = [
    { name: 'teams', path: 'teams', create: () => TestBed.createComponent(TeamsComponent) },
    { name: 'systems', path: 'systems', create: () => TestBed.createComponent(SystemsComponent) },
    { name: 'environments', path: 'environments', create: () => TestBed.createComponent(EnvironmentsComponent) },
    { name: 'Swagger status', path: 'swaggersync/status', create: () => TestBed.createComponent(SwaggerSyncComponent) }
  ];
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [TeamsComponent, SystemsComponent, EnvironmentsComponent, SwaggerSyncComponent, OrganizationsComponent],
      providers: [provideRouter([]), provideNoopAnimations(),
        provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }]
    }).compileComponents();
    context = TestBed.inject(OrganizationContextService);
    TestBed.inject(AuthService).currentUser.set(testUser);
    http = TestBed.inject(HttpTestingController);
    const pending = context.initialize(testUser.userId);
    http.expectOne(`${apiBase}/organizations`).flush({ success: true, data: { organizations: [organization], canManageUsers: false } });
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: { organization, permissions } });
    await pending;
  });
  afterEach(() => { http.verify({ ignoreCancelled: true }); localStorage.clear(); });

  for (const surface of cases) {
    it(`${surface.name} displays stable structural IDs and refuses mutation callbacks`, () => {
      const fixture = surface.create();
      fixture.detectChanges();
      for (const request of http.match(req => req.url.startsWith(apiBase))) {
        const data = request.request.url.endsWith('/status') ? [{
          environmentId: resourceId, environmentName: '[restricted]', systemName: '[restricted]', totalEndpoints: 2
        }] : { items: [{
          id: resourceId, name: '[restricted]', teamId: 'parent-team', teamName: '[restricted]',
          systemId: 'parent-system', systemName: '[restricted]', ownerName: '[restricted]',
          description: '[restricted]', systemCount: 1, environmentCount: 1, endpointCount: 2,
          environmentType: 'Development', isActive: true
        }] };
        request.flush({ success: true, data });
      }
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.textContent).toContain(resourceId);
      expect(element.textContent).toContain('org.structuralOnly');
      expect(element.querySelector('.filter-search, input[placeholder="Search systems..."]')).toBeNull();
      const instance = fixture.componentInstance;
      if (instance instanceof TeamsComponent || instance instanceof SystemsComponent || instance instanceof EnvironmentsComponent) {
        instance.openForm();
        instance.submit();
        instance.delete(resourceId);
        expect(instance.showForm).toBeFalse();
        if (instance instanceof EnvironmentsComponent) instance.sync(resourceId);
      } else if (instance instanceof SwaggerSyncComponent) {
        instance.saveSchedule();
        instance.runNow();
        instance.syncEnv({ environmentId: resourceId, environmentName: '[restricted]', systemName: '[restricted]' });
      }
      expect(context.apiIssue()?.key).toBe('org.forbidden');
      http.expectNone(req => req.method !== 'GET');
    });

    it(`${surface.name} shows backend 403 instead of an empty successful read`, async () => {
      const fixture = surface.create();
      fixture.detectChanges();
      for (const request of http.match(req => req.url.startsWith(apiBase))) {
        if (request.request.url === `${apiBase}/${surface.path}`) {
          request.flush({}, { status: 403, statusText: 'Forbidden' });
        } else request.flush({ success: true, data: { items: [] } });
      }
      fixture.detectChanges();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('org.forbidden');
      http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: { organization, permissions } });
      await settleAsync();
      http.expectNone(`${apiBase}/${surface.path}`);
    });
  }

  it('renders structural organization/member/role identities without recovering names', () => {
    const fixture = TestBed.createComponent(OrganizationsComponent);
    fixture.detectChanges();
    http.expectOne(`${apiBase}/organizations/current/members`).flush({ success: true, data: [{
      id: 'member', userId: resourceId, username: '[restricted]', fullName: '[restricted]',
      role: organization.membership.role, state: 'Active'
    }] });
    http.expectOne(`${apiBase}/organizations/current/roles`).flush({ success: true, data: [organization.membership.role] });
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain(organizationA.id);
    expect(element.querySelector('tbody')?.textContent).toContain(resourceId);
    expect(element.querySelector('tbody')?.textContent).toContain('Active');
    expect(element.textContent).not.toContain('[restricted]');
  });
});
