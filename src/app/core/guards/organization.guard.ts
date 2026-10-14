import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OrganizationContextService } from '../services/organization-context.service';
import { canEnterDashboard } from '../authorization/organization-navigation';

export const organizationGuard: CanActivateChildFn = async (route, state) => {
  const auth = inject(AuthService);
  const context = inject(OrganizationContextService);
  const router = inject(Router);
  const user = auth.currentUser();
  if (!user) return router.createUrlTree(['/login']);
  await context.initialize(user.userId);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/login']);
  if (!route.data['organizationOptional'] && !context.ready()) {
    return router.createUrlTree(['/organizations']);
  }
  const permission = route.data['permission'] as string | undefined;
  const anyPermissions = route.data['anyPermissions'] as readonly string[] | undefined;
  if ((permission && !context.hasPermission(permission)) ||
      (anyPermissions && !anyPermissions.some(key => context.hasPermission(key))) ||
      (route.data['dashboard'] && !canEnterDashboard(key => context.hasPermission(key))) ||
      (route.data['effect'] === 'Mutation' && !context.canMutate()) ||
      (route.data['effect'] === 'CredentialAccess' && !context.canAccessSensitiveContent())) {
    context.reportApiError(403);
    return router.createUrlTree(['/access-denied'], {
      queryParams: state.url.startsWith('/workbench') ? { from: 'workbench' } : undefined
    });
  }
  return true;
};
