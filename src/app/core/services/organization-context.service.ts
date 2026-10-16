import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/models';
import { canEnterDashboard, managementPermissions } from '../authorization/organization-navigation';
import {
  apiErrorKey, Organization, OrganizationContext, OrganizationDiscovery, OrganizationMember,
  OrganizationRole, OrganizationInvitation, OrganizationLifecycleResult, organizationIdPattern
} from '../models/organization';

@Injectable({ providedIn: 'root' })
export class OrganizationContextService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/organizations`;
  private readonly organizationState = signal<readonly Organization[]>([]);
  private readonly selected = signal<Organization | null>(null);
  private readonly context = signal<OrganizationContext | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly platform = signal(false);
  private readonly issue = signal<{ status: number; key: string } | null>(null);
  private readonly storageIssue = signal(false);
  private readonly boundary = new Subject<void>();
  private readonly changes = new Subject<void>();
  private userId: string | null = null;
  private initialized = false;
  private initialization: Promise<boolean> | null = null;
  private selection: Promise<boolean> | null = null;
  private generation = 0;
  private readonly revisionState = signal(0);
  private refresh: Promise<void> | null = null;

  readonly organizations = this.organizationState.asReadonly();
  readonly activeOrganization = this.selected.asReadonly();
  readonly activeOrganizationId = computed(() => this.selected()?.id ?? null);
  readonly membership = computed(() => this.context()?.organization.membership ?? null);
  readonly permissions = computed(() => this.context()?.permissions ?? []);
  readonly canManageUsers = this.platform.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly apiIssue = this.issue.asReadonly();
  readonly storageUnavailable = this.storageIssue.asReadonly();
  readonly ready = computed(() => !!this.context() && !this.loadingState());
  readonly structuralOnly = computed(() => !this.ready() || this.membership()?.isReadOnly !== false);
  readonly canMutate = computed(() => this.ready() && !this.structuralOnly());
  readonly canAccessSensitiveContent = computed(() => this.ready() && !this.structuralOnly());
  readonly scopeChanges$ = this.boundary.asObservable();
  readonly changes$ = this.changes.asObservable();
  readonly revision = this.revisionState.asReadonly();

  initialize(userId: string, force = false): Promise<boolean> {
    if (!force && this.userId === userId && this.initialization) return this.initialization;
    if (!force && this.userId === userId && this.initialized) return this.selection ?? Promise.resolve(this.ready());
    this.reset();
    this.userId = userId;
    const version = this.generation;
    this.loadingState.set(true);
    const pending = this.load(userId, version);
    this.initialization = pending;
    void pending.finally(() => {
      if (this.initialization === pending) this.initialization = null;
    });
    return pending;
  }

  private async load(userId: string, version: number): Promise<boolean> {
    try {
      const result = await firstValueFrom(this.http.get<ApiResponse<OrganizationDiscovery>>(this.base));
      if (version !== this.generation) return false;
      if (!result.success || !result.data) throw new Error('Invalid organization discovery response.');
      const organizations = result.data.organizations;
      if (!Array.isArray(organizations) || organizations.some(o =>
        !organizationIdPattern.test(o.id) || o.id === '00000000-0000-0000-0000-000000000000' ||
        o.membership.userId !== userId || o.membership.state !== 'Active' ||
        typeof o.membership.isReadOnly !== 'boolean')) {
        throw new Error('Invalid organization membership response.');
      }
      this.organizationState.set(Object.freeze(organizations.map(o => this.freezeOrganization(o))));
      this.platform.set(result.data.canManageUsers === true);
      this.initialized = true;
      const previous = this.readSelection(userId);
      const organization = organizations.find(o => o.id === previous) ?? organizations[0];
      if (!organization) {
        this.removeSelection();
        this.errorState.set('org.noMembership');
        this.loadingState.set(false);
        this.changes.next();
        return false;
      }
      return await this.selectOrganization(organization.id);
    } catch (error) {
      if (version === this.generation) {
        this.fail(error);
        this.loadingState.set(false);
        this.changes.next();
      }
      return false;
    }
  }

  prepareOrganizationSwitch(): void {
    this.clearTenantState();
    this.selected.set(null);
    this.loadingState.set(true);
  }

  selectOrganization(id: string): Promise<boolean> {
    const pending = this.activate(id);
    this.selection = pending;
    void pending.finally(() => { if (this.selection === pending) this.selection = null; });
    return pending;
  }

  private async activate(id: string): Promise<boolean> {
    const organization = this.organizations().find(o => o.id === id);
    if (!organization || !organizationIdPattern.test(id)) {
      this.invalidate('org.invalidContext');
      return false;
    }
    this.clearTenantState();
    const version = this.generation;
    this.selected.set(this.freezeOrganization(organization));
    this.loadingState.set(true);
    try {
      const result = await firstValueFrom(
        this.http.get<ApiResponse<OrganizationContext>>(`${this.base}/current`)
      );
      if (version !== this.generation) return false;
      if (!result.success || !result.data || result.data.organization.id !== id ||
          result.data.organization.membership.userId !== this.userId ||
          result.data.organization.membership.state !== 'Active' ||
          typeof result.data.organization.membership.isReadOnly !== 'boolean') {
        throw new Error('Invalid active membership response.');
      }
      const validated = this.freezeContext(result.data);
      this.selected.set(validated.organization);
      this.context.set(validated);
      this.loadingState.set(false);
      this.writeSelection(id);
      this.changes.next();
      return true;
    } catch (error) {
      if (version === this.generation) {
        this.fail(error);
        this.selected.set(null);
        this.loadingState.set(false);
        this.removeSelection();
        this.changes.next();
      }
      return false;
    }
  }

  revalidate(id: string): Promise<void> {
    if (this.refresh) return this.refresh;
    const version = this.generation;
    const pending = this.refreshMembership(id, version);
    this.refresh = pending;
    void pending.finally(() => { if (this.refresh === pending) this.refresh = null; });
    return pending;
  }

  private async refreshMembership(id: string, version: number): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.get<ApiResponse<OrganizationContext>>(`${this.base}/current`)
      );
      if (version !== this.generation || id !== this.activeOrganizationId()) return;
      if (!result.success || !result.data || result.data.organization.id !== id ||
          result.data.organization.membership.userId !== this.userId ||
          result.data.organization.membership.state !== 'Active' ||
          typeof result.data.organization.membership.isReadOnly !== 'boolean') {
        throw new Error('Invalid refreshed membership response.');
      }
      const validated = this.freezeContext(result.data);
      if (JSON.stringify(this.context()) !== JSON.stringify(validated)) {
        const issue = this.apiIssue();
        this.clearTenantState();
        this.context.set(validated);
        this.selected.set(validated.organization);
        this.issue.set(issue);
        this.changes.next();
      }
    } catch (error) {
      if (version === this.generation) {
        this.fail(error);
        this.invalidate(error instanceof HttpErrorResponse ? apiErrorKey(error.status) : 'org.loadFailed');
      }
    }
  }

  reportApiError(status: number): void { this.issue.set({ status, key: apiErrorKey(status) }); }
  dismissApiError(): void { this.issue.set(null); }
  hasPermission(key: string): boolean {
    return key === 'users.manage' ? this.canManageUsers() : this.ready() && this.permissions().includes(key);
  }

  requireMutation(permission: string): boolean {
    if (this.canMutate() && this.hasPermission(permission)) return true;
    this.reportApiError(403);
    return false;
  }

  landingPath(): string {
    if (!this.ready()) return this.canManageUsers() ? '/users' : '/organizations';
    const has = (key: string) => this.hasPermission(key);
    if (canEnterDashboard(has)) return '/dashboard';
    if (this.canMutate() && managementPermissions.some(has)) return '/management';
    for (const [permission, path] of [
      ['teams.view', '/teams'], ['systems.view', '/systems'], ['environments.view', '/environments'],
      ['endpoints.view', '/endpoints'], ['swaggersync.view', '/swagger-sync'], ['governance.view', '/governance']
    ]) {
      if (has(permission)) return path;
    }
    return this.canManageUsers() ? '/users' : '/organizations';
  }

  getMembers() {
    return this.http.get<ApiResponse<OrganizationMember[]>>(`${this.base}/current/members`);
  }

  getRoles() {
    return this.http.get<ApiResponse<OrganizationRole[]>>(`${this.base}/current/roles`);
  }

  getAssignableRoles() {
    return this.http.get<ApiResponse<OrganizationRole[]>>(`${this.base}/current/assignable-roles`);
  }

  getInvitations() {
    return this.http.get<ApiResponse<OrganizationInvitation[]>>(`${this.base}/current/invitations`);
  }

  updateOrganizationName(name: string) {
    return this.http.patch<ApiResponse<OrganizationLifecycleResult>>(`${this.base}/current`, { name });
  }

  createInvitation(email: string, roleId: string) {
    return this.http.post<ApiResponse<OrganizationLifecycleResult>>(`${this.base}/current/invitations`, { email, roleId });
  }

  cancelInvitation(id: string) {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/current/invitations/${encodeURIComponent(id)}`);
  }

  changeMemberRole(id: string, roleId: string) {
    return this.http.put<ApiResponse<OrganizationLifecycleResult>>(
      `${this.base}/current/members/${encodeURIComponent(id)}/role`, { roleId });
  }

  removeMember(id: string) {
    return this.http.delete<ApiResponse<OrganizationLifecycleResult>>(
      `${this.base}/current/members/${encodeURIComponent(id)}`);
  }

  leaveOrganization() {
    return this.http.post<ApiResponse<OrganizationLifecycleResult>>(`${this.base}/current/leave`, {});
  }

  acceptInvitation(token: string) {
    return this.http.post<ApiResponse<OrganizationLifecycleResult>>(
      `${environment.apiUrl}/organization-invitations/accept`, { token });
  }

  async refreshDiscoveryWithoutSwitching(clearCurrent = false): Promise<boolean> {
    const userId = this.userId;
    if (!userId) return false;
    if (clearCurrent) {
      this.clearTenantState();
      this.selected.set(null);
      this.context.set(null);
      this.removeSelection();
    }
    const version = this.generation;
    this.loadingState.set(true);
    try {
      const result = await firstValueFrom(this.http.get<ApiResponse<OrganizationDiscovery>>(this.base));
      if (version !== this.generation) return false;
      if (!result.success || !result.data || !Array.isArray(result.data.organizations) ||
          result.data.organizations.some(o => !organizationIdPattern.test(o.id) ||
            o.membership.userId !== userId || o.membership.state !== 'Active' ||
            typeof o.membership.isReadOnly !== 'boolean')) {
        throw new Error('Invalid organization discovery response.');
      }
      const organizations = Object.freeze(result.data.organizations.map(o => this.freezeOrganization(o)));
      this.organizationState.set(organizations);
      this.platform.set(result.data.canManageUsers === true);
      this.initialized = true;
      if (!clearCurrent) {
        const selectedId = this.activeOrganizationId();
        if (selectedId) {
          const selected = organizations.find(o => o.id === selectedId);
          if (selected) {
            this.selected.set(selected);
            const currentContext = this.context();
            if (currentContext) this.context.set(this.freezeContext({ ...currentContext, organization: selected }));
          } else {
            this.clearTenantState();
            this.selected.set(null);
            this.removeSelection();
          }
        }
      }
      this.loadingState.set(false);
      this.errorState.set(null);
      this.changes.next();
      return true;
    } catch (error) {
      if (version === this.generation) {
        this.fail(error);
        this.loadingState.set(false);
        this.changes.next();
      }
      return false;
    }
  }

  invalidate(key = 'org.noMembership'): void {
    const id = this.activeOrganizationId();
    this.clearTenantState();
    if (id) this.organizationState.update(list => list.filter(o => o.id !== id));
    this.selected.set(null);
    this.loadingState.set(false);
    this.errorState.set(key);
    this.removeSelection();
  }

  reset(clearSelection = false): void {
    if (clearSelection) this.removeSelection();
    this.clearTenantState();
    this.userId = null;
    this.initialized = false;
    this.initialization = null;
    this.selection = null;
    this.refresh = null;
    this.selected.set(null);
    this.organizationState.set([]);
    this.platform.set(false);
    this.loadingState.set(false);
    this.changes.next();
  }

  private clearTenantState(): void {
    this.generation++;
    this.refresh = null;
    this.revisionState.set(this.generation);
    this.context.set(null);
    this.errorState.set(null);
    this.issue.set(null);
    this.boundary.next();
    this.changes.next();
  }

  private fail(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) console.error('Organization context failed.', error);
    this.errorState.set(error instanceof HttpErrorResponse ? apiErrorKey(error.status) : 'org.loadFailed');
  }

  private freezeOrganization(value: Organization): Organization {
    return Object.freeze({
      ...value,
      membership: Object.freeze({ ...value.membership, role: Object.freeze({ ...value.membership.role }) })
    });
  }

  private freezeContext(value: OrganizationContext): OrganizationContext {
    if (!Array.isArray(value.permissions) || value.permissions.some(permission => typeof permission !== 'string')) {
      throw new Error('Invalid organization permission metadata.');
    }
    return Object.freeze({
      ...value, organization: this.freezeOrganization(value.organization),
      permissions: Object.freeze([...value.permissions])
    });
  }

  private readSelection(userId: string): string | null {
    try { return localStorage.getItem(`activeOrganization:${userId}`); }
    catch (error) { this.storageFailed(error); return null; }
  }

  private writeSelection(id: string): void {
    try { localStorage.setItem(`activeOrganization:${this.userId}`, id); }
    catch (error) { this.storageFailed(error); }
  }

  private removeSelection(): void {
    if (!this.userId) return;
    try { localStorage.removeItem(`activeOrganization:${this.userId}`); }
    catch (error) { this.storageFailed(error); }
  }

  private storageFailed(error: unknown): void {
    console.warn('Organization selection could not be persisted.', error);
    this.storageIssue.set(true);
  }
}
