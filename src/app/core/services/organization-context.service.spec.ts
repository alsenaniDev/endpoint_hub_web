import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { OrganizationContextService } from './organization-context.service';
import { NotificationService } from './notification.service';
import { OrganizationRealtimeService } from './organization-realtime.service';
import { EMPTY } from 'rxjs';
import { apiRequestPath, authInterceptor } from '../interceptors/auth.interceptor';
import { organizationGuard } from '../guards/organization.guard';

import { testUser, organizationA, organizationB, testContext, apiBase, settleAsync } from './organization.fixtures.spec';

describe('Organization context and centralized API boundary', () => {
  let context: OrganizationContextService;
  let auth: AuthService;
  let http: HttpTestingController;
  let client: HttpClient;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
        { provide: OrganizationRealtimeService, useValue: {
          notifications$: EMPTY, synchronized$: EMPTY, error: () => false,
          start: () => {}, stop: () => {}, retry: () => {}
        } }]
    });
    context = TestBed.inject(OrganizationContextService);
    auth = TestBed.inject(AuthService);
    auth.currentUser.set(testUser);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });
  afterEach(() => { http.verify({ ignoreCancelled: true }); localStorage.clear(); });

  async function load(organizations = [organizationA, organizationB], selected = organizationA) {
    const result = context.initialize(testUser.userId);
    const discovery = http.expectOne(`${apiBase}/organizations`);
    expect(discovery.request.headers.has('X-Organization-Id')).toBeFalse();
    discovery.flush({ success: true, data: { organizations, canManageUsers: false } });
    await settleAsync();
    if (organizations.length) http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: testContext(selected)
    });
    return result;
  }

  it('loads live memberships and role, never JWT/legacy role or permission hints', async () => {
    expect(await load()).toBeTrue();
    expect(context.organizations().length).toBe(2);
    expect(context.membership()?.role.name).toBe('Organization Owner');
    expect(auth.hasPermission('users.manage')).toBeFalse();
    expect(auth.hasPermission('systems.manage')).toBeTrue();
    expect(auth.hasPermission('governance.manage')).toBeFalse();
  });

  it('preserves explicit null team IDs and nested role descriptions from discovery and context', async () => {
    expect(await load()).toBeTrue();
    expect(context.organizations()[0].membership.teamId).toBeNull();
    expect(context.organizations()[0].membership.role.description).toBeNull();
    expect(context.membership()?.teamId).toBeNull();
    expect(context.membership()?.role.description).toBeNull();
    expect(context.error()).toBeNull();
  });

  it('preserves non-null team IDs and nested role descriptions without coercion', async () => {
    const organization = {
      ...organizationA,
      membership: {
        ...organizationA.membership,
        teamId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        role: { ...organizationA.membership.role, description: 'Organization owner capabilities' }
      }
    };
    expect(await load([organization], organization)).toBeTrue();
    expect(context.membership()?.teamId).toBe(organization.membership.teamId);
    expect(context.membership()?.role.description).toBe(organization.membership.role.description);
  });

  it('restores only a still-valid user-specific organization selection', async () => {
    localStorage.setItem(`activeOrganization:${testUser.userId}`, organizationB.id);
    await load(undefined, organizationB);
    expect(context.activeOrganizationId()).toBe(organizationB.id);
  });

  it('rejects a revoked persisted ID and persists a backend-returned valid alternative', async () => {
    localStorage.setItem(`activeOrganization:${testUser.userId}`, 'not-a-membership');
    await load();
    expect(context.activeOrganizationId()).toBe(organizationA.id);
    expect(localStorage.getItem(`activeOrganization:${testUser.userId}`)).toBe(organizationA.id);
  });

  it('shows an empty state and clears selection when membership is missing', async () => {
    expect(await load([])).toBeFalse();
    expect(context.error()).toBe('org.noMembership');
    expect(context.activeOrganizationId()).toBeNull();
    expect(context.ready()).toBeFalse();
  });

  it('does not invent or accept arbitrary active IDs', async () => {
    await load();
    expect(await context.selectOrganization('cccccccc-cccc-cccc-cccc-cccccccccccc')).toBeFalse();
    expect(context.ready()).toBeFalse();
    expect(context.error()).toBe('org.invalidContext');
  });

  it('exposes immutable organization identities, membership and permission hints', async () => {
    await load();
    expect(Object.isFrozen(context.organizations())).toBeTrue();
    expect(Object.isFrozen(context.activeOrganization())).toBeTrue();
    expect(Object.isFrozen(context.membership())).toBeTrue();
    expect(Object.isFrozen(context.membership()?.role)).toBeTrue();
    expect(Object.isFrozen(context.permissions())).toBeTrue();
  });

  it('handles superseded selections without accepting a late old context response', async () => {
    await load();
    const previous = context.selectOrganization(organizationA.id);
    const old = http.expectOne(`${apiBase}/organizations/current`);
    const latest = context.selectOrganization(organizationB.id);
    expect(old.cancelled).toBeTrue();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: testContext(organizationB) });
    expect(await latest).toBeTrue();
    expect(await previous).toBeFalse();
    expect(context.activeOrganizationId()).toBe(organizationB.id);
  });

  it('keeps safe in-memory selection when persistence is unavailable and shows a warning', async () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('Storage denied');
    spyOn(Storage.prototype, 'setItem').and.throwError('Storage denied');
    spyOn(console, 'warn');
    expect(await load()).toBeTrue();
    expect(context.storageUnavailable()).toBeTrue();
    expect(console.warn).toHaveBeenCalled();
  });

  it('clears session and context on logout even if browser storage fails', async () => {
    await load();
    spyOn(Storage.prototype, 'removeItem').and.throwError('Storage denied');
    spyOn(console, 'error');
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    auth.logout();
    expect(auth.isAuthenticated()).toBeFalse();
    expect(context.activeOrganizationId()).toBeNull();
    expect(context.permissions()).toEqual([]);
    expect(console.error).toHaveBeenCalled();
  });

  it('removes the logged-out user selection without weakening membership restoration on ordinary reload', async () => {
    await load();
    expect(localStorage.getItem(`activeOrganization:${testUser.userId}`)).toBe(organizationA.id);
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    auth.logout();
    expect(localStorage.getItem(`activeOrganization:${testUser.userId}`)).toBeNull();
    expect(context.membership()).toBeNull();
    expect(context.permissions()).toEqual([]);
    expect(context.canMutate()).toBeFalse();
  });

  it('switches membership/role, cancels old tenant requests and overwrites caller headers', async () => {
    await load();
    let oldDelivered = false;
    client.get(`${apiBase}/systems`).subscribe(() => oldDelivered = true);
    const old = http.expectOne(`${apiBase}/systems`);
    const switched = context.selectOrganization(organizationB.id);
    expect(old.cancelled).toBeTrue();
    expect(context.ready()).toBeFalse();
    const current = http.expectOne(`${apiBase}/organizations/current`);
    expect(current.request.headers.get('X-Organization-Id')).toBe(organizationB.id);
    current.flush({ success: true, data: testContext(organizationB) });
    await switched;
    client.get(`${apiBase}/endpoints`, {
      headers: new HttpHeaders({ 'X-Organization-Id': organizationA.id })
    }).subscribe();
    const next = http.expectOne(`${apiBase}/endpoints`);
    expect(next.request.headers.get('X-Organization-Id')).toBe(organizationB.id);
    next.flush({ success: true, data: [] });
    expect(oldDelivered).toBeFalse();
    expect(context.membership()?.role.name).toBe('Organization Member');
  });

  it('fails a tenant request locally with 400 when context is missing', () => {
    let status = 0;
    client.get(`${apiBase}/systems`).subscribe({ error: error => status = error.status });
    http.expectNone(`${apiBase}/systems`);
    expect(status).toBe(400);
    expect(context.apiIssue()?.key).toBe('org.invalidContext');
  });

  it('does not send bearer credentials to assets or foreign origins', () => {
    client.get('/assets/i18n/en.json').subscribe();
    const asset = http.expectOne('/assets/i18n/en.json');
    expect(asset.request.headers.has('Authorization')).toBeFalse();
    asset.flush({});
    expect(apiRequestPath('https://example.invalid/api/systems')).toBeNull();
  });

  it('does not attach organization context to identity/platform requests', async () => {
    await load();
    for (const path of ['auth/profile', 'users/roles', 'teams/public']) {
      client.get(`${apiBase}/${path}`, { headers: { 'X-Organization-Id': organizationB.id } }).subscribe();
      const request = http.expectOne(`${apiBase}/${path}`);
      expect(request.request.headers.has('X-Organization-Id')).toBeFalse();
      request.flush({ success: true, data: [] });
    }
  });

  for (const [status, key] of [[400, 'org.invalidContext'], [404, 'org.unavailable'], [409, 'org.deferred']] as const) {
    it(`surfaces ${status} distinctly without logging out or converting it to success`, async () => {
      await load();
      let actual = 0;
      client.get(`${apiBase}/systems`).subscribe({ error: error => actual = error.status });
      http.expectOne(`${apiBase}/systems`).flush({}, { status, statusText: 'Rejected' });
      expect(actual).toBe(status);
      expect(context.apiIssue()?.key).toBe(key);
      expect(auth.isAuthenticated()).toBeTrue();
    });
  }

  it('handles 401 by clearing authentication, organization and pending tenant state', async () => {
    await load();
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    client.get(`${apiBase}/systems`).subscribe({ error: () => undefined });
    http.expectOne(`${apiBase}/systems`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBeFalse();
    expect(context.activeOrganizationId()).toBeNull();
    expect(context.organizations()).toEqual([]);
  });

  it('treats 403 as forbidden, refreshes permissions, and does not retry the denied operation', async () => {
    await load();
    client.get(`${apiBase}/systems`).subscribe({ error: () => undefined });
    http.expectOne(`${apiBase}/systems`).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(context.apiIssue()?.key).toBe('org.forbidden');
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: testContext(organizationA) });
    await settleAsync();
    http.expectNone(`${apiBase}/systems`);
    expect(context.ready()).toBeTrue();
  });

  it('clears active membership and visible state when the existing token is revoked', async () => {
    await load();
    client.get(`${apiBase}/endpoints`).subscribe({ error: () => undefined });
    http.expectOne(`${apiBase}/endpoints`).flush({}, { status: 403, statusText: 'Forbidden' });
    http.expectOne(`${apiBase}/organizations/current`).flush({}, { status: 403, statusText: 'Forbidden' });
    await settleAsync();
    expect(context.ready()).toBeFalse();
    expect(context.membership()).toBeNull();
    expect(context.activeOrganizationId()).toBeNull();
    expect(context.error()).toBe('org.noMembership');
  });

  it('updates role/permission UX from refreshed membership, not stored login hints', async () => {
    await load();
    client.get(`${apiBase}/systems`).subscribe({ error: () => undefined });
    http.expectOne(`${apiBase}/systems`).flush({}, { status: 403, statusText: 'Forbidden' });
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: { organization: organizationA, permissions: ['endpoints.view'] }
    });
    await settleAsync();
    expect(auth.hasPermission('systems.manage')).toBeFalse();
    expect(auth.hasPermission('endpoints.view')).toBeTrue();
  });

  it('clears A notifications immediately and reloads B through scoped HTTP only', async () => {
    await load();
    const notifications = TestBed.inject(NotificationService);
    notifications.init();
    expect(notifications.loading()).toBeTrue();
    http.expectOne(`${apiBase}/notifications`).flush({
      success: true, data: [{ id: 'notification-a', message: 'A private notice', isRead: false }]
    });
    expect(notifications.loading()).toBeFalse();
    expect(notifications.notifications().length).toBe(1);
    const switching = context.selectOrganization(organizationB.id);
    expect(notifications.notifications()).toEqual([]);
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: testContext(organizationB) });
    await switching;
    const next = http.expectOne(`${apiBase}/notifications`);
    expect(next.request.headers.get('X-Organization-Id')).toBe(organizationB.id);
    next.flush({ success: true, data: [] });
    expect(notifications.notifications()).toEqual([]);
    notifications.disconnect();
  });

  it('blocks tenant routes without an organization but leaves settings accessible', async () => {
    await load([]);
    const router = TestBed.inject(Router);
    const route = new ActivatedRouteSnapshot();
    route.data = {};
    const guarded = await TestBed.runInInjectionContext(() => organizationGuard(route, router.routerState.snapshot));
    expect(guarded instanceof UrlTree && router.serializeUrl(guarded)).toBe('/organizations');
    route.data = { organizationOptional: true };
    expect(await TestBed.runInInjectionContext(() => organizationGuard(route, router.routerState.snapshot))).toBeTrue();
  });

  it('blocks an expired session and rejects ungranted/platform routes', async () => {
    await load();
    const router = TestBed.inject(Router);
    const route = new ActivatedRouteSnapshot();
    route.data = { organizationOptional: true, permission: 'users.manage' };
    const platform = await TestBed.runInInjectionContext(() => organizationGuard(route, router.routerState.snapshot));
    expect(platform instanceof UrlTree && router.serializeUrl(platform)).toBe('/access-denied');
    auth.currentUser.set(null);
    const expired = await TestBed.runInInjectionContext(() => organizationGuard(route, router.routerState.snapshot));
    expect(expired instanceof UrlTree && router.serializeUrl(expired)).toBe('/login');
  });
});
