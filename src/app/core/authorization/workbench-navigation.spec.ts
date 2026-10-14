import { isWorkbenchItemAvailable, workbenchLandingRoute, workbenchNavigation } from './workbench-navigation';

describe('workbench navigation', () => {
  const permissions = (...keys: string[]) => (key: string) => keys.includes(key);
  const availableLabels = (keys: string[], canMutate: boolean) =>
    workbenchNavigation.filter(item => isWorkbenchItemAvailable(item, permissions(...keys), canMutate))
      .map(item => item.label);

  it('keeps management commands out of the primary Workbench navigation', () => {
    expect(availableLabels([
      'teams.manage', 'systems.manage', 'environments.manage', 'endpoints.manage'
    ], true)).toEqual([]);
    expect(workbenchLandingRoute(true, permissions(
      'teams.manage', 'systems.manage', 'environments.manage', 'endpoints.manage'
    ))).toBe('/access-denied');
  });

  it('does not use mutation-only grants as a Workbench landing destination', () => {
    expect(availableLabels(['endpoints.manage'], true)).toEqual([]);
    expect(workbenchLandingRoute(true, permissions('endpoints.manage'))).toBe('/access-denied');
  });

  it('lands on a normal readable Workbench page before considering mutation-only capabilities', () => {
    expect(workbenchLandingRoute(true, permissions('systems.manage', 'endpoints.view'))).toBe('/workbench/endpoints');
    expect(workbenchLandingRoute(true, permissions('endpoints.manage', 'teams.view'))).toBe('/workbench/teams');
  });

  it('shows the structural Viewer read destinations and no management destination', () => {
    const viewerPermissions = [
      'teams.view', 'systems.view', 'environments.view',
      'endpoints.view', 'swaggersync.view', 'governance.view'
    ];
    expect(availableLabels(viewerPermissions, false)).toEqual([
      'Overview', 'Teams', 'Systems', 'Environments', 'Endpoints', 'Swagger', 'Governance'
    ]);
    expect(workbenchLandingRoute(false, permissions(...viewerPermissions))).toBe('/workbench/overview');
  });

  it('uses translation keys for every shared Workbench destination while retaining English labels', () => {
    expect(workbenchNavigation.map(item => [item.label, item.translationKey])).toEqual([
      ['Overview', 'workbench.nav.overview'],
      ['Teams', 'workbench.nav.teams'],
      ['Systems', 'workbench.nav.systems'],
      ['Environments', 'workbench.nav.environments'],
      ['Endpoints', 'workbench.nav.endpoints'],
      ['Swagger', 'workbench.nav.swagger'],
      ['Governance', 'workbench.nav.governance']
    ]);
  });

  it('does not present manage navigation without a mutable live membership', () => {
    expect(availableLabels(['teams.manage'], false)).toEqual([]);
    expect(workbenchLandingRoute(false, permissions('teams.manage'))).toBe('/access-denied');
  });

  it('chooses the first individually authorized read destination when overview is incomplete', () => {
    expect(workbenchLandingRoute(false, permissions('governance.view'))).toBe('/workbench/governance');
  });
});
