export const managementPermissions = [
  'teams.manage', 'systems.manage', 'environments.manage', 'endpoints.manage'
] as const;

export const dashboardPermissions = [
  'teams.view', 'systems.view', 'environments.view', 'endpoints.view', 'swaggersync.view'
] as const;

export function canEnterDashboard(hasPermission: (key: string) => boolean): boolean {
  return dashboardPermissions.every(hasPermission);
}
