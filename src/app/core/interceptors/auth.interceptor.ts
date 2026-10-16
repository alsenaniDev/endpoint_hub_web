import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, filter, takeUntil, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';
import { OrganizationContextService } from '../services/organization-context.service';

export function apiRequestPath(url: string): string | null {
  const base = new URL(environment.apiUrl, window.location.origin);
  const target = new URL(url, window.location.origin);
  const prefix = base.pathname.replace(/\/$/, '') + '/';
  if (base.origin !== target.origin || !target.pathname.startsWith(prefix)) return null;
  return target.pathname.slice(prefix.length).toLowerCase();
}

export function requiresOrganization(path: string): boolean {
  return !path.startsWith('auth/') && path !== 'organizations' &&
    path !== 'organization-invitations/accept' &&
    path !== 'teams/public' && path !== 'users' && !path.startsWith('users/');
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const path = apiRequestPath(req.url);
  if (path === null) return next(req.clone({ headers: req.headers.delete('X-Organization-Id') }));
  const auth = inject(AuthService);
  const organization = inject(OrganizationContextService);
  const token = auth.getToken();
  const tenant = requiresOrganization(path);
  const id = tenant ? organization.activeOrganizationId() : null;
  let headers = req.headers.delete('X-Organization-Id');
  if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  if (id) headers = headers.set('X-Organization-Id', id);
  const response = tenant && !id
    ? throwError(() => new HttpErrorResponse({
        status: 400, url: req.url, error: { success: false, message: 'Active organization is required.' }
      }))
    : next(req.clone({ headers }));
  return response.pipe(
    takeUntil(tenant ? organization.scopeChanges$ : []),
    filter(() => !tenant || id === organization.activeOrganizationId()),
    catchError((error: HttpErrorResponse) => {
      if (token === auth.getToken()) {
        organization.reportApiError(error.status);
        if (error.status === 401) auth.logout();
        else if (tenant && path === 'organizations/current' && error.status === 403) {
          organization.invalidate('org.noMembership');
        } else if (tenant && id && error.status === 403) {
          void organization.revalidate(id);
        }
      }
      return throwError(() => error);
    })
  );
};
