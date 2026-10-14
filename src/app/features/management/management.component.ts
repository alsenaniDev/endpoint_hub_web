import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { ApiResponse, CreateEnvironmentRequest, CreateSwaggerSourceRequest, CreateSystemRequest,
  CreateTeamRequest, EnvironmentType } from '../../core/models/models';
import { apiErrorKey, organizationIdPattern } from '../../core/models/organization';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

type Resource = 'teams' | 'systems' | 'environments' | 'sources' | 'endpoints';
type Operation = 'create' | 'replace' | 'delete' | 'notes';
const resources: readonly { value: Resource; label: string; permission: string }[] = [
  { value: 'teams', label: 'nav.teams', permission: 'teams.manage' },
  { value: 'systems', label: 'nav.systems', permission: 'systems.manage' },
  { value: 'environments', label: 'nav.environments', permission: 'environments.manage' },
  { value: 'sources', label: 'management.sources', permission: 'environments.manage' },
  { value: 'endpoints', label: 'nav.endpoints', permission: 'endpoints.manage' }
];

@Component({
  selector: 'app-management',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe],
  templateUrl: './management.component.html',
  styleUrls: ['./management.component.scss']
})
export class ManagementComponent {
  readonly context = inject(OrganizationContextService);
  readonly isWorkbench = inject(Router).url.startsWith('/workbench');
  private readonly api = inject(ApiService);
  private readonly destroy = inject(DestroyRef);
  readonly available = computed(() => this.context.canMutate()
    ? resources.filter(resource => this.context.hasPermission(resource.permission)) : []);
  readonly resource = signal<Resource>('endpoints');
  readonly operation = signal<Operation>('notes');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly resultId = signal<string | null>(null);
  readonly operations = computed<readonly Operation[]>(() => this.resource() === 'endpoints'
    ? ['notes'] : ['create', 'replace', 'delete']);
  readonly environmentTypes: readonly EnvironmentType[] = ['Local', 'Development', 'Test', 'Staging', 'Production'];
  id = '';
  parentId = '';
  name = '';
  description = '';
  contactEmail = '';
  slackChannel = '';
  ownerName = '';
  ownerEmail = '';
  ownerContact = '';
  repositoryUrl = '';
  environmentType: EnvironmentType = 'Development';
  swaggerUrl = '';
  baseUrl = '';
  active: boolean | null = null;
  notes = '';
  usedInPages = '';
  acknowledged = false;

  constructor() {
    effect(() => {
      this.context.revision();
      const allowed = this.available();
      this.clearFields();
      this.resource.set(allowed[0]?.value ?? 'endpoints');
      this.operation.set(allowed[0]?.value === 'endpoints' || !allowed.length ? 'notes' : 'create');
    }, { allowSignalWrites: true });
  }

  selectResource(value: Resource): void {
    if (!this.available().some(resource => resource.value === value)) {
      this.error.set('org.forbidden');
      return;
    }
    this.clearFields();
    this.resource.set(value);
    this.operation.set(value === 'endpoints' ? 'notes' : 'create');
  }

  selectOperation(value: Operation): void {
    if (!this.operations().includes(value)) {
      this.error.set('org.forbidden');
      return;
    }
    this.clearFields();
    this.operation.set(value);
  }

  submit(): void {
    if (this.busy()) return;
    this.error.set(null);
    this.success.set(null);
    this.resultId.set(null);
    if (!this.context.canMutate() || !this.available().some(resource => resource.value === this.resource()) ||
        !this.operations().includes(this.operation())) {
      this.error.set('org.forbidden');
      return;
    }
    if (!this.validInput()) {
      this.error.set('management.invalid');
      return;
    }
    const revision = this.context.revision();
    const creating = this.operation() === 'create';
    const targetId = this.id.trim();
    this.busy.set(true);
    this.request().pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: result => {
        if (revision !== this.context.revision()) return;
        this.busy.set(false);
        if (!result.success) {
          this.error.set('org.requestFailed');
          return;
        }
        const id = creating ? this.createdId(result.data) : targetId;
        if (!id) {
          this.error.set('management.resultUnavailable');
          return;
        }
        this.clearFields();
        this.success.set('management.saved');
        this.resultId.set(id);
      },
      error: (error: HttpErrorResponse) => {
        if (revision !== this.context.revision()) return;
        this.busy.set(false);
        this.error.set(apiErrorKey(error.status));
      }
    });
  }

  private createdId(data: unknown): string | null {
    return typeof data === 'object' && data !== null && 'id' in data &&
      typeof data.id === 'string' && organizationIdPattern.test(data.id) &&
      data.id !== '00000000-0000-0000-0000-000000000000' ? data.id : null;
  }

  private validInput(): boolean {
    const isId = (id: string) => organizationIdPattern.test(id.trim()) &&
      id.trim() !== '00000000-0000-0000-0000-000000000000';
    const operation = this.operation();
    const resource = this.resource();
    if (operation !== 'create' && !isId(this.id)) return false;
    if (resource === 'sources' && !isId(this.parentId)) return false;
    if (operation !== 'create' && !this.acknowledged) return false;
    if (operation === 'delete' || operation === 'notes') return true;
    if (!this.name.trim()) return false;
    if ((resource === 'systems' || (resource === 'environments' && operation === 'create')) && !isId(this.parentId)) return false;
    if (resource === 'systems' && !this.ownerName.trim()) return false;
    if (resource === 'environments' || resource === 'sources') {
      if (typeof this.active !== 'boolean') return false;
      if (resource === 'environments' && !this.environmentTypes.includes(this.environmentType)) return false;
      if (resource === 'sources' && (!this.swaggerUrl.trim() || !this.baseUrl.trim())) return false;
    }
    return true;
  }

  private request(): Observable<ApiResponse<unknown>> {
    const id = this.id.trim();
    const parentId = this.parentId.trim();
    const operation = this.operation();
    switch (this.resource()) {
      case 'teams': {
        if (operation === 'delete') return this.api.deleteTeam(id);
        const payload: CreateTeamRequest = { name: this.name, description: this.description,
          contactEmail: this.contactEmail, slackChannel: this.slackChannel };
        return operation === 'create' ? this.api.createTeam(payload) : this.api.updateTeam(id, payload);
      }
      case 'systems': {
        if (operation === 'delete') return this.api.deleteSystem(id);
        const payload: CreateSystemRequest = { teamId: parentId, name: this.name, description: this.description,
          ownerName: this.ownerName, ownerEmail: this.ownerEmail, ownerContact: this.ownerContact,
          repositoryUrl: this.repositoryUrl };
        return operation === 'create' ? this.api.createSystem(payload) : this.api.updateSystem(id, payload);
      }
      case 'environments': {
        if (operation === 'delete') return this.api.deleteEnvironment(id);
        const payload: Omit<CreateEnvironmentRequest, 'systemId'> = { name: this.name,
          environmentType: this.environmentType, swaggerUrl: this.swaggerUrl, baseUrl: this.baseUrl,
          isActive: this.active === true };
        return operation === 'create' ? this.api.createEnvironment({ systemId: parentId, ...payload })
          : this.api.updateEnvironment(id, payload);
      }
      case 'sources': {
        if (operation === 'delete') return this.api.deleteSwaggerSource(parentId, id);
        const payload: CreateSwaggerSourceRequest = { label: this.name, url: this.swaggerUrl,
          baseUrl: this.baseUrl, isActive: this.active === true };
        return operation === 'create' ? this.api.createSwaggerSource(parentId, payload)
          : this.api.updateSwaggerSource(parentId, id, payload);
      }
      case 'endpoints': return this.api.updateEndpointNotes(id, this.notes, this.usedInPages);
    }
  }

  private clearFields(): void {
    this.id = this.parentId = this.name = this.description = this.contactEmail = this.slackChannel = '';
    this.ownerName = this.ownerEmail = this.ownerContact = this.repositoryUrl = '';
    this.swaggerUrl = this.baseUrl = this.notes = this.usedInPages = '';
    this.environmentType = 'Development';
    this.active = null;
    this.acknowledged = false;
    this.busy.set(false);
    this.error.set(null);
    this.success.set(null);
    this.resultId.set(null);
  }
}
