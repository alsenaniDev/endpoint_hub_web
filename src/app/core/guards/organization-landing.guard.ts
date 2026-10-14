import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { OrganizationContextService } from '../services/organization-context.service';

export const organizationLandingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const context = inject(OrganizationContextService);
  const router = inject(Router);
  const user = auth.currentUser();
  if (!user) return router.createUrlTree(['/login']);
  await context.initialize(user.userId);
  return router.createUrlTree([auth.isAuthenticated() ? context.landingPath() : '/login']);
};
