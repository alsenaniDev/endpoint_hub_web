import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OrganizationContextService } from '../services/organization-context.service';
import { organizationGuard } from './organization.guard';

describe('organizationGuard route transitions', () => {
  let router: Router;
  let context: {
    initialize: jasmine.Spy;
    ready: ReturnType<typeof signal<boolean>>;
    canManageUsers: ReturnType<typeof signal<boolean>>;
    canMutate: ReturnType<typeof signal<boolean>>;
    canAccessSensitiveContent: ReturnType<typeof signal<boolean>>;
    hasPermission: jasmine.Spy;
    reportApiError: jasmine.Spy;
  };

  beforeEach(() => {
    context = {
      initialize: jasmine.createSpy('initialize').and.resolveTo(false),
      ready: signal(false),
      canManageUsers: signal(false),
      canMutate: signal(false),
      canAccessSensitiveContent: signal(false),
      hasPermission: jasmine.createSpy('hasPermission').and.returnValue(false),
      reportApiError: jasmine.createSpy('reportApiError')
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ userId: 'user-a' }), isAuthenticated: () => true } },
        { provide: OrganizationContextService, useValue: context }
      ]
    });
    router = TestBed.inject(Router);
  });

  async function guard(url: string, data: Record<string, unknown> = {}) {
    const route = { data } as ActivatedRouteSnapshot;
    const state = { url } as RouterStateSnapshot;
    return await TestBed.runInInjectionContext(() => organizationGuard(route, state));
  }

  it('redirects protected no-membership Workbench routes to the established organization-selection flow', async () => {
    const result = await guard('/workbench/endpoints', { permission: 'endpoints.view' });
    expect(context.initialize).toHaveBeenCalledOnceWith('user-a');
    expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe('/organizations');
    expect(context.reportApiError).not.toHaveBeenCalled();
  });

  it('keeps organization-optional Workbench settings safe while context is unavailable', async () => {
    const result = await guard('/workbench/settings/members', { organizationOptional: true });
    expect(result).toBeTrue();
    expect(context.hasPermission).not.toHaveBeenCalled();
  });

  it('marks Workbench-origin authorization denials for a Workbench-aware return destination', async () => {
    context.ready.set(true);
    context.hasPermission.and.returnValue(false);
    const result = await guard('/workbench/systems', { permission: 'systems.view' });
    const tree = result as ReturnType<Router['createUrlTree']>;
    expect(router.serializeUrl(tree)).toBe('/access-denied?from=workbench');
    expect(context.reportApiError).toHaveBeenCalledOnceWith(403);
  });

  it('does not mark legacy-origin denials as Workbench navigation', async () => {
    context.ready.set(true);
    const result = await guard('/systems', { permission: 'systems.view' });
    expect(router.serializeUrl(result as ReturnType<Router['createUrlTree']>)).toBe('/access-denied');
  });
});
