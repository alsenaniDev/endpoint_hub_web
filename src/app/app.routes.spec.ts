import { routes } from './app.routes';
import { WorkbenchShellComponent } from './workbench/workbench-shell.component';
import { authGuard } from './core/guards/auth.guard';
import { organizationGuard } from './core/guards/organization.guard';
import { NotificationWorkspaceComponent } from './features/notifications/notification-workspace.component';
import { LoginComponent } from './features/auth/login/login.component';
import { OrganizationSelectionComponent } from './features/organizations/organization-selection.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { SystemsComponent } from './features/systems/systems.component';
import { EnvironmentsComponent } from './features/environments/environments.component';
import { AccessDeniedComponent } from './features/organizations/access-denied.component';
import { ChangeHistoryComponent } from './features/endpoints/change-history/change-history.component';
import { CodeGeneratorComponent } from './features/endpoints/code-generator/code-generator.component';

describe('parallel workbench routing', () => {
  const workbenchRoute = routes.find(route => route.path === 'workbench');
  const legacyRoute = routes.find(route => route.path === '');

  it('uses its own authenticated, organization-guarded shell', () => {
    expect(workbenchRoute?.component).toBe(WorkbenchShellComponent);
    expect(workbenchRoute?.canActivate).toContain(authGuard);
    expect(workbenchRoute?.canActivateChild).toContain(organizationGuard);
  });

  it('renders access denial outside the legacy shell without weakening authentication or context checks', async () => {
    const deniedRoute = routes.find(route => route.path === 'access-denied');
    const deniedPage = deniedRoute?.children?.find(route => route.path === '');
    expect(deniedRoute?.component).toBeUndefined();
    expect(deniedRoute?.canActivate).toContain(authGuard);
    expect(deniedRoute?.canActivateChild).toContain(organizationGuard);
    expect(deniedPage?.data).toEqual({ organizationOptional: true });
    expect(await deniedPage?.loadComponent?.()).toBe(AccessDeniedComponent);
    expect(legacyRoute?.children?.some(route => route.path === 'access-denied')).toBeFalse();
  });

  it('defines permission-guarded workbench destinations', () => {
    const children = workbenchRoute?.children ?? [];
    expect(children.map(route => route.path)).toContain('manage');
    expect(children.find(route => route.path === 'manage')?.data).toEqual({
      anyPermissions: jasmine.any(Array),
      effect: 'Mutation'
    });

    expect(children.find(route => route.path === 'overview')?.data).toEqual({
      permission: 'endpoints.view',
      dashboard: true
    });
    expect(children.find(route => route.path === 'teams')?.data?.['permission']).toBe('teams.view');
    expect(children.find(route => route.path === 'systems')?.data?.['permission']).toBe('systems.view');
    expect(children.find(route => route.path === 'environments')?.data?.['permission']).toBe('environments.view');
    expect(children.find(route => route.path === 'endpoints')?.data?.['permission']).toBe('endpoints.view');
    expect(children.find(route => route.path === 'endpoints/:id')?.data?.['permission']).toBe('endpoints.view');
    expect(children.find(route => route.path === 'endpoints/:id/run')?.data?.['permission']).toBe('endpoints.run');
    expect(children.find(route => route.path === 'endpoints/:id/history')?.data).toEqual({
      permission: 'endpoints.view',
      effect: 'CredentialAccess'
    });
    expect(children.find(route => route.path === 'endpoints/:id/code')?.data).toEqual({
      permission: 'endpoints.view',
      effect: 'CredentialAccess'
    });
    expect(children.find(route => route.path === 'swagger')?.data?.['permission']).toBe('swaggersync.view');
    expect(children.find(route => route.path === 'governance')?.data?.['permission']).toBe('governance.view');
    expect(children.find(route => route.path === 'endpoints/:id/run')?.data?.['permission']).toBe('endpoints.run');
  });

  it('provides an organization-settings Management route with the same mutation-only permission boundary', async () => {
    const children = workbenchRoute?.children ?? [];
    const settingsManagement = children.find(route => route.path === 'settings/management');
    const directCompatibility = children.find(route => route.path === 'manage');
    expect(settingsManagement?.data).toEqual(directCompatibility?.data);
    expect(await settingsManagement?.loadComponent?.()).toBe(await directCompatibility?.loadComponent?.());
    expect(settingsManagement?.data?.['anyPermissions']).toEqual([
      'teams.manage', 'systems.manage', 'environments.manage', 'endpoints.manage'
    ]);
  });

  it('reuses the dashboard feature while keeping distinct Workbench and legacy presentations', async () => {
    const overview = workbenchRoute?.children?.find(route => route.path === 'overview');
    const dashboard = legacyRoute?.children?.find(route => route.path === 'dashboard');
    expect(await overview?.loadComponent?.()).toBe(DashboardComponent);
    expect(await dashboard?.loadComponent?.()).toBe(DashboardComponent);
    expect(overview?.data?.['permission']).toBe('endpoints.view');
    expect(dashboard?.data?.['permission']).toBe('endpoints.view');
  });

  it('reuses the existing Systems feature with the same authorization boundary on both routes', async () => {
    const workbench = workbenchRoute?.children?.find(route => route.path === 'systems');
    const legacy = legacyRoute?.children?.find(route => route.path === 'systems');
    expect(await workbench?.loadComponent?.()).toBe(SystemsComponent);
    expect(await legacy?.loadComponent?.()).toBe(SystemsComponent);
    expect(workbench?.data?.['permission']).toBe('systems.view');
    expect(legacy?.data?.['permission']).toBe('systems.view');
  });

  it('reuses the existing Environments feature with the same authorization boundary on both routes', async () => {
    const workbench = workbenchRoute?.children?.find(route => route.path === 'environments');
    const legacy = legacyRoute?.children?.find(route => route.path === 'environments');
    expect(await workbench?.loadComponent?.()).toBe(EnvironmentsComponent);
    expect(await legacy?.loadComponent?.()).toBe(EnvironmentsComponent);
    expect(workbench?.data?.['permission']).toBe('environments.view');
    expect(legacy?.data?.['permission']).toBe('environments.view');
  });

  it('leaves the original application shell and its routes registered', () => {
    expect(legacyRoute).toBeDefined();
    expect(legacyRoute?.component).toBeDefined();
    const oldPaths = legacyRoute?.children?.map(route => route.path) ?? [];
    expect(oldPaths).toContain('management');
    expect(oldPaths).toContain('dashboard');
    expect(oldPaths).toContain('teams');
    expect(oldPaths).toContain('systems');
    expect(oldPaths).toContain('environments');
    expect(oldPaths).toContain('endpoints');
    expect(oldPaths).toContain('endpoints/:id/run');
  });

  it('keeps sign-in outside Workbench and routes the access entry to organization selection', async () => {
    const login = routes.find(route => route.path === 'login');
    expect(await login?.loadComponent?.()).toBe(LoginComponent);
    const start = legacyRoute?.children?.find(route => route.path === 'start');
    expect(start?.data).toEqual({ organizationOptional: true });
    expect(start?.data?.['permission']).toBeUndefined();
    expect(start?.data?.['anyPermissions']).toBeUndefined();
    expect(await start?.loadComponent?.()).toBe(OrganizationSelectionComponent);
  });

  it('does not grant request execution to the currently provisioned organization roles', () => {
    const currentRolePermissions: Record<string, string[]> = {
      Admin: ['teams.manage', 'systems.manage', 'environments.manage', 'endpoints.manage'],
      Developer: ['endpoints.manage'],
      Viewer: ['teams.view', 'systems.view', 'environments.view', 'endpoints.view', 'swaggersync.view', 'governance.view']
    };
    for (const permissions of Object.values(currentRolePermissions)) {
      expect(permissions).not.toContain('endpoints.run');
    }
  });

  it('keeps both Swagger routes on the same existing status-read authorization boundary', () => {
    expect(workbenchRoute?.children?.find(route => route.path === 'swagger')?.data).toEqual({ permission: 'swaggersync.view' });
    expect(legacyRoute?.children?.find(route => route.path === 'swagger-sync')?.data).toEqual({ permission: 'swaggersync.view' });
  });

  it('reuses every Governance component with identical permissions on parallel routes', async () => {
    for (const path of ['governance', 'governance/standards/:id', 'governance/runs/:runId/report', 'governance/validate']) {
      const workbench = workbenchRoute?.children?.find(route => route.path === path);
      const legacy = legacyRoute?.children?.find(route => route.path === path);
      expect(workbench?.data).toEqual(legacy?.data);
      expect(await workbench?.loadComponent?.()).toBe(await legacy?.loadComponent?.());
    }
  });

  it('adds Workbench-prefixed endpoint history and code routes without replacing legacy routes', async () => {
    for (const [path, component] of [
      ['endpoints/:id/history', ChangeHistoryComponent],
      ['endpoints/:id/code', CodeGeneratorComponent]
    ] as const) {
      const workbench = workbenchRoute?.children?.find(route => route.path === path);
      const legacy = legacyRoute?.children?.find(route => route.path === path);
      expect(workbench).toBeDefined();
      expect(legacy).toBeDefined();
      expect(workbench?.data).toEqual(legacy?.data);
      expect(await workbench?.loadComponent?.()).toBe(component);
      expect(await legacy?.loadComponent?.()).toBe(component);
    }
  });
  it('reuses the existing organization settings component without inventing a member-management permission', async () => {
    const settings = workbenchRoute?.children?.find(route => route.path === 'settings/members');
    const legacy = legacyRoute?.children?.find(route => route.path === 'organizations');
    expect(settings?.data).toEqual(legacy?.data);
    expect(settings?.data?.['permission']).toBeUndefined();
    expect(await settings?.loadComponent?.()).toBe(await legacy?.loadComponent?.());
  });

  it('adds an organization-scoped Action Center without inventing a notification permission', async () => {
    const notifications = workbenchRoute?.children?.find(route => route.path === 'notifications');
    expect(notifications).toBeDefined();
    expect(notifications?.data?.['permission']).toBeUndefined();
    expect(notifications?.data?.['organizationOptional']).toBeUndefined();
    expect(await notifications?.loadComponent?.()).toBe(NotificationWorkspaceComponent);
  });
});
