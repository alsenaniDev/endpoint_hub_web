import { canEnterDashboard } from './organization-navigation';

export interface WorkbenchNavItem {
  readonly label: string;
  readonly translationKey: string;
  readonly route: string;
  readonly icon: string;
  readonly permission?: string;
  readonly anyPermissions?: readonly string[];
  readonly dashboard?: boolean;
}

export const workbenchNavigation: readonly WorkbenchNavItem[] = [
  { label: 'Overview', translationKey: 'workbench.nav.overview', route: '/workbench/overview', icon: 'pi pi-th-large', dashboard: true },
  { label: 'Teams', translationKey: 'workbench.nav.teams', route: '/workbench/teams', icon: 'pi pi-users', permission: 'teams.view' },
  { label: 'Systems', translationKey: 'workbench.nav.systems', route: '/workbench/systems', icon: 'pi pi-sitemap', permission: 'systems.view' },
  { label: 'Environments', translationKey: 'workbench.nav.environments', route: '/workbench/environments', icon: 'pi pi-globe', permission: 'environments.view' },
  { label: 'Endpoints', translationKey: 'workbench.nav.endpoints', route: '/workbench/endpoints', icon: 'pi pi-share-alt', permission: 'endpoints.view' },
  { label: 'Swagger', translationKey: 'workbench.nav.swagger', route: '/workbench/swagger', icon: 'pi pi-file', permission: 'swaggersync.view' },
  { label: 'Governance', translationKey: 'workbench.nav.governance', route: '/workbench/governance', icon: 'pi pi-shield', permission: 'governance.view' }
];

const preferredReadRoutes = [
  ['teams.view', '/workbench/teams'],
  ['systems.view', '/workbench/systems'],
  ['environments.view', '/workbench/environments'],
  ['endpoints.view', '/workbench/endpoints'],
  ['swaggersync.view', '/workbench/swagger'],
  ['governance.view', '/workbench/governance']
] as const;

export function isWorkbenchItemAvailable(
  item: WorkbenchNavItem,
  hasPermission: (key: string) => boolean,
  canMutate: boolean
): boolean {
  if (item.dashboard) return canEnterDashboard(hasPermission);
  if (item.permission) return hasPermission(item.permission);
  if (item.anyPermissions) return canMutate && item.anyPermissions.some(hasPermission);
  return false;
}

export function workbenchLandingRoute(
  canMutate: boolean,
  hasPermission: (key: string) => boolean
): string {
  if (canEnterDashboard(hasPermission)) return '/workbench/overview';
  return preferredReadRoutes.find(([permission]) => hasPermission(permission))?.[1] ?? '/access-denied';
}
