import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { OrganizationContextService } from '../services/organization-context.service';
import { TranslateService } from '../services/translate.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { organizationGuard } from './organization.guard';
import { organizationLandingGuard } from './organization-landing.guard';
import { Organization } from '../models/organization';
import { SidebarComponent } from '../../layout/sidebar/sidebar.component';
import { OrganizationSwitcherComponent } from '../../shared/components/organization-switcher/organization-switcher.component';
import { managementPermissions } from '../authorization/organization-navigation';
import { testUser, organizationA, organizationB, apiBase, settleAsync } from '../services/organization.fixtures.spec';

const bundles = {
  Admin: ['teams.manage', 'systems.manage', 'environments.manage', 'endpoints.manage'],
  Developer: ['endpoints.manage'],
  Viewer: ['teams.view', 'systems.view', 'environments.view', 'endpoints.view', 'swaggersync.view', 'governance.view']
};
type Role = keyof typeof bundles;

describe('Live-contract role navigation without grant expansion', () => {
  let context: OrganizationContextService;
  let http: HttpTestingController;
  let router: Router;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [SidebarComponent, OrganizationSwitcherComponent],
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }]
    });
    context = TestBed.inject(OrganizationContextService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    TestBed.inject(AuthService).currentUser.set(testUser);
  });
  afterEach(() => { http.verify({ ignoreCancelled: true }); localStorage.clear(); });

  function org(role: Role, base = organizationA): Organization {
    return { ...base, name: role === 'Viewer' ? '[restricted]' : base.name,
      membership: { ...base.membership, isReadOnly: role === 'Viewer',
        role: { ...base.membership.role, name: role === 'Viewer' ? '[restricted]' : role } } };
  }
  async function load(role: Role, others: Organization[] = []) {
    const organization = org(role);
    const pending = context.initialize(testUser.userId);
    http.expectOne(`${apiBase}/organizations`).flush({ success: true, data: {
      organizations: [organization, ...others], canManageUsers: false
    } });
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: { organization, permissions: bundles[role] }
    });
    return pending;
  }
  async function guard(data: ActivatedRouteSnapshot['data']) {
    const route = new ActivatedRouteSnapshot();
    route.data = data;
    const result = TestBed.runInInjectionContext(() => organizationGuard(route, router.routerState.snapshot));
    return isObservable(result) ? firstValueFrom(result) : result;
  }
  function destination(value: boolean | UrlTree) {
    return value instanceof UrlTree ? router.serializeUrl(value) : value;
  }

  for (const role of ['Admin', 'Developer', 'Viewer'] as const) {
    it(`${role} retains existing membership-based settings access without users.manage`, async () => {
      await load(role);
      expect(await guard({ organizationOptional: true })).toBeTrue();
      expect(context.permissions()).not.toContain('users.manage');
    });
    it(`${role} preserves Governance read separately from policy mutation and evaluation`, async () => {
      await load(role);
      expect(destination(await guard({ permission: 'governance.view' }))).toBe(role === 'Viewer' ? true : '/access-denied');
      expect(destination(await guard({ permission: 'governance.manage', effect: 'Mutation' }))).toBe('/access-denied');
      expect(destination(await guard({ permission: 'governance.run', effect: 'Mutation' }))).toBe('/access-denied');
    });

    it(`${role} preserves Swagger status access separately from execution and schedule management`, async () => {
      await load(role);
      expect(destination(await guard({ permission: 'swaggersync.view' }))).toBe(role === 'Viewer' ? true : '/access-denied');
      expect(destination(await guard({ permission: 'swaggersync.run', effect: 'Mutation' }))).toBe('/access-denied');
      expect(destination(await guard({ permission: 'swaggersync.manageschedule', effect: 'Mutation' }))).toBe('/access-denied');
    });

    it(`${role} bootstraps and selects only its live-permission destination`, async () => {
      expect(await load(role)).toBeTrue();
      const landing = await TestBed.runInInjectionContext(() =>
        organizationLandingGuard(new ActivatedRouteSnapshot(), router.routerState.snapshot));
      expect(landing instanceof UrlTree && router.serializeUrl(landing)).toBe(role === 'Viewer' ? '/dashboard' : '/management');
      const sidebar = TestBed.createComponent(SidebarComponent).componentInstance;
      const paths = sidebar.navItems.filter(item => sidebar.visible(item)).map(item => item.route);
      expect(paths).toContain(role === 'Viewer' ? '/dashboard' : '/management');
      expect(paths).not.toContain('/users');
      expect(paths).not.toContain('/auth-profiles');
      expect(context.canMutate()).toBe(role !== 'Viewer');
      if (role !== 'Viewer') {
        expect(paths).not.toContain('/endpoints');
        expect(paths).not.toContain('/dashboard');
        expect(destination(await guard({ permission: 'endpoints.view' }))).toBe('/access-denied');
        expect(await guard({ anyPermissions: managementPermissions, effect: 'Mutation' })).toBeTrue();
      }
    });
  }

  it('preserves Viewer Active state with restricted names and denies mutation/credential routes', async () => {
    await load('Viewer');
    expect(context.membership()?.state).toBe('Active');
    expect(context.membership()?.role.name).toBe('[restricted]');
    expect(context.structuralOnly()).toBeTrue();
    for (const effect of ['Mutation', 'CredentialAccess']) {
      expect(destination(await guard({ permission: 'endpoints.view', effect }))).toBe('/access-denied');
    }
    expect(destination(await guard({ anyPermissions: managementPermissions, effect: 'Mutation' }))).toBe('/access-denied');
    expect(await guard({ permission: 'endpoints.view' })).toBeTrue();
  });

  it('requires the full dashboard read bundle rather than one view key', async () => {
    await load('Viewer');
    const refresh = context.revalidate(organizationA.id);
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: {
      organization: org('Viewer'), permissions: ['endpoints.view']
    } });
    await refresh;
    expect(context.landingPath()).toBe('/endpoints');
    expect(destination(await guard({ permission: 'endpoints.view', dashboard: true }))).toBe('/access-denied');
  });

  for (const state of ['[restricted]', 'Revoked', 0]) {
    it(`rejects invalid membership state ${state} rather than treating it as Active`, async () => {
      spyOn(console, 'error');
      const pending = context.initialize(testUser.userId);
      http.expectOne(`${apiBase}/organizations`).flush({ success: true, data: {
        organizations: [{ ...organizationA, membership: { ...organizationA.membership, state } }], canManageUsers: false
      } });
      expect(await pending).toBeFalse();
      expect(context.error()).toBe('org.loadFailed');
      expect(context.canMutate()).toBeFalse();
      http.expectNone(`${apiBase}/organizations/current`);
    });
  }

  for (const isReadOnly of [undefined, 'false', null]) {
    it(`fails closed for missing/invalid read-only metadata ${isReadOnly}`, async () => {
      spyOn(console, 'error');
      const pending = context.initialize(testUser.userId);
      http.expectOne(`${apiBase}/organizations`).flush({ success: true, data: {
        organizations: [{ ...organizationA, membership: { ...organizationA.membership, isReadOnly } }], canManageUsers: false
      } });
      expect(await pending).toBeFalse();
      expect(context.canAccessSensitiveContent()).toBeFalse();
      expect(context.structuralOnly()).toBeTrue();
    });
  }

  it('rejects invalid effect metadata in current and refresh responses', async () => {
    spyOn(console, 'error');
    await load('Developer');
    const refresh = context.revalidate(organizationA.id);
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: {
      organization: { ...organizationA, membership: { ...organizationA.membership, isReadOnly: 'false' } },
      permissions: bundles.Developer
    } });
    await refresh;
    expect(context.ready()).toBeFalse();
    expect(context.canMutate()).toBeFalse();
    expect(context.error()).toBe('org.loadFailed');
  });

  it('rejects non-structural permission metadata rather than treating it as a capability list', async () => {
    spyOn(console, 'error');
    await load('Developer');
    const refresh = context.revalidate(organizationA.id);
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: {
      organization: org('Developer'), permissions: ['endpoints.manage', 42]
    } });
    await refresh;
    expect(context.ready()).toBeFalse();
    expect(context.hasPermission('endpoints.manage')).toBeFalse();
    expect(context.error()).toBe('org.loadFailed');
  });

  it('switches Admin to Viewer, clears old effects, and chooses the new authorized destination', async () => {
    await load('Admin', [org('Viewer', organizationB)]);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const switcher = TestBed.createComponent(OrganizationSwitcherComponent).componentInstance;
    const switched = switcher.switchOrganization(organizationB.id);
    expect(context.canMutate()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/organizations']);
    await settleAsync();
    const current = http.expectOne(`${apiBase}/organizations/current`);
    expect(current.request.headers.get('X-Organization-Id')).toBe(organizationB.id);
    current.flush({ success: true, data: { organization: org('Viewer', organizationB), permissions: bundles.Viewer } });
    await switched;
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(context.membership()?.isReadOnly).toBeTrue();
    expect(context.permissions()).toEqual(bundles.Viewer);
    expect(context.hasPermission('endpoints.manage')).toBeFalse();
  });

  it('switches Viewer to Developer without retaining a dashboard or resource URL', async () => {
    await load('Viewer', [org('Developer', organizationB)]);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const switcher = TestBed.createComponent(OrganizationSwitcherComponent).componentInstance;
    const switched = switcher.switchOrganization(organizationB.id);
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: {
      organization: org('Developer', organizationB), permissions: bundles.Developer
    } });
    await switched;
    expect(navigate.calls.allArgs()).toEqual([[['/organizations']], [['/management']]]);
    expect(context.hasPermission('endpoints.view')).toBeFalse();
    expect(context.canMutate()).toBeTrue();
  });

  it('keeps a forbidden current-context switch on settings and invalidates its membership', async () => {
    await load('Admin', [org('Developer', organizationB)]);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    const switched = TestBed.createComponent(OrganizationSwitcherComponent).componentInstance.switchOrganization(organizationB.id);
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({}, { status: 403, statusText: 'Forbidden' });
    await switched;
    expect(navigate.calls.allArgs()).toEqual([[['/organizations']]]);
    expect(context.ready()).toBeFalse();
    expect(context.error()).toBe('org.noMembership');
  });

  it('does not activate a new tenant until the neutral route has finished replacing old resource URLs', async () => {
    await load('Admin', [org('Viewer', organizationB)]);
    let finishNavigation!: (value: boolean) => void;
    const neutralNavigation = new Promise<boolean>(resolve => { finishNavigation = resolve; });
    spyOn(router, 'navigate').and.callFake(commands =>
      commands[0] === '/organizations' ? neutralNavigation : Promise.resolve(true));
    const switched = TestBed.createComponent(OrganizationSwitcherComponent).componentInstance.switchOrganization(organizationB.id);
    expect(context.ready()).toBeFalse();
    expect(context.activeOrganizationId()).toBeNull();
    expect(context.canMutate()).toBeFalse();
    http.expectNone(`${apiBase}/organizations/current`);
    finishNavigation(true);
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: {
      organization: org('Viewer', organizationB), permissions: bundles.Viewer
    } });
    await switched;
    expect(context.activeOrganizationId()).toBe(organizationB.id);
  });

  it('reports cancelled neutral navigation without activating or retaining tenant authority', async () => {
    await load('Admin', [org('Viewer', organizationB)]);
    spyOn(router, 'navigate').and.resolveTo(false);
    await TestBed.createComponent(OrganizationSwitcherComponent).componentInstance.switchOrganization(organizationB.id);
    http.expectNone(`${apiBase}/organizations/current`);
    expect(context.ready()).toBeFalse();
    expect(context.permissions()).toEqual([]);
    expect(context.loading()).toBeFalse();
    expect(context.error()).toBe('org.requestFailed');
  });
});
