import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, AuthResult, LoginRequest, RegisterRequest } from '../models/models';
import { OrganizationContextService } from './organization-context.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  currentUser = signal<AuthResult | null>(this.loadUser());
  permissions = computed(() => this.organization.permissions());

  constructor(private http: HttpClient, private router: Router,
    private organization: OrganizationContextService) { }

  hasPermission(key: string): boolean {
    return this.organization.hasPermission(key);
  }

  login(payload: LoginRequest): Observable<ApiResponse<AuthResult>> {
    return this.http.post<ApiResponse<AuthResult>>(`${this.apiUrl}/login`, payload).pipe(
      tap(res => { if (res.success && res.data) this.storeUser(res.data); })
    );
  }

  register(payload: RegisterRequest): Observable<ApiResponse<AuthResult>> {
    return this.http.post<ApiResponse<AuthResult>>(`${this.apiUrl}/register`, payload).pipe(
      tap(res => { if (res.success && res.data) this.storeUser(res.data); })
    );
  }

  logout(): void {
    this.currentUser.set(null);
    this.organization.reset(true);
    try { localStorage.removeItem('auth'); }
    catch (error) { console.error('Stored session could not be removed.', error); }
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.currentUser()?.accessToken ?? null;
  }

  isAuthenticated(): boolean {
    return !!this.currentUser();
  }

  private storeUser(user: AuthResult): void {
    this.organization.reset();
    localStorage.setItem('auth', JSON.stringify(user));
    this.currentUser.set(user);
  }

  private loadUser(): AuthResult | null {
    try {
      const stored = localStorage.getItem('auth');
      if (!stored) return null;
      const user: unknown = JSON.parse(stored);
      if (!isAuthResult(user)) throw new Error('Invalid stored session.');
      return user;
    } catch (error) {
      console.warn('Stored session could not be restored.', error);
      return null;
    }
  }
}

function isAuthResult(value: unknown): value is AuthResult {
  return typeof value === 'object' && value !== null &&
    'accessToken' in value && typeof value.accessToken === 'string' && !!value.accessToken &&
    'refreshToken' in value && typeof value.refreshToken === 'string' &&
    'username' in value && typeof value.username === 'string' &&
    'role' in value && typeof value.role === 'string' &&
    'userId' in value && typeof value.userId === 'string' &&
    'permissions' in value && Array.isArray(value.permissions) &&
    value.permissions.every(permission => typeof permission === 'string');
}
