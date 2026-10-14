import { Component, OnDestroy, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors, FormArray, FormGroup } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { Router, RouterModule } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { EnvironmentDto, SystemDto, EnvironmentType, SwaggerSourceDto } from '../../core/models/models';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { apiErrorKey } from '../../core/models/organization';

@Component({
  selector: 'app-environments',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DropdownModule, RouterModule, LoadingComponent, TranslatePipe],
  templateUrl: './environments.component.html',
  styleUrls: ['./environments.component.scss']
})
export class EnvironmentsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  auth = inject(AuthService);
  readonly organization = inject(OrganizationContextService);
  readonly readError = signal<string | null>(null);
  private fb = inject(FormBuilder);
  readonly isWorkbench = inject(Router).url.startsWith('/workbench');

  environments = signal<EnvironmentDto[]>([]);
  systems = signal<SystemDto[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = false;
  editingId: string | null = null;
  syncing = signal<Record<string, boolean>>({});
  syncResults = signal<Record<string, string>>({});
  selectedEnvironmentId = signal<string | null>(null);
  readonly selectedEnvironment = computed(() =>
    this.filteredEnvs().find(environment => environment.id === this.selectedEnvironmentId()) ?? null
  );
  readonly selectedSystem = computed(() => {
    const environment = this.selectedEnvironment();
    return environment ? this.systems().find(system => system.id === environment.systemId) ?? null : null;
  });
  private scopeChangesSubscription?: Subscription;
  private workbenchLoadSubscription?: Subscription;

  filterSystemId = signal('');
  filterEnvType = signal('');
  filterStatus = signal('');
  searchTerm = signal('');
  existingSourceIds = signal<string[]>([]);
  activeTab = signal<'single' | 'multi'>('single');

  constructor() {
    effect(() => {
      const ctrl = this.form.get('baseUrl')!;
      if (this.activeTab() === 'single') {
        ctrl.setValidators([Validators.required]);
      } else {
        ctrl.clearValidators();
      }
      ctrl.updateValueAndValidity();
    });
  }

  hasActiveFilters = computed(() =>
    !!this.filterSystemId() || !!this.filterEnvType() || !!this.filterStatus() || !!this.searchTerm()
  );

  filteredEnvs = computed(() => {
    const sysId = this.filterSystemId();
    const type = this.filterEnvType();
    const status = this.filterStatus();
    const q = this.searchTerm().toLowerCase().trim();
    return this.environments().filter(env => {
      if (sysId && env.systemId !== sysId) return false;
      if (type && env.environmentType !== type) return false;
      if (status === 'active' && !env.isActive) return false;
      if (status === 'inactive' && env.isActive) return false;
      if (q && !env.systemName.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  filteredCount = computed(() => this.filteredEnvs().length);

  systemGroups = computed(() => {
    const map = new Map<string, { systemName: string; envs: EnvironmentDto[] }>();
    for (const env of this.filteredEnvs()) {
      if (!map.has(env.systemId)) map.set(env.systemId, { systemName: env.systemName, envs: [] });
      map.get(env.systemId)!.envs.push(env);
    }
    return Array.from(map.values()).sort((a, b) => a.systemName.localeCompare(b.systemName));
  });

  envTypes = [
    { value: 'Local', label: 'Local' }, { value: 'Development', label: 'Development' },
    { value: 'Staging', label: 'Staging' }, { value: 'UAT', label: 'UAT' }, { value: 'Production', label: 'Production' }
  ];

  swaggerUrlValidator = (control: AbstractControl): ValidationErrors | null => {
    const url: string = control.value ?? '';
    if (!url) return null;
    return url.toLowerCase().endsWith('.json') ? null : { swaggerJson: true };
  };

  form = this.fb.group({
    systemId: ['', Validators.required],
    name: ['', Validators.required],
    environmentType: ['Development', Validators.required],
    swaggerUrl: ['', [this.swaggerUrlValidator]],
    baseUrl: [''],
    isActive: [true],
    sources: this.fb.array([])
  });

  get sourcesArray(): FormArray { return this.form.get('sources') as FormArray; }

  newSourceGroup(s?: SwaggerSourceDto): FormGroup {
    return this.fb.group({
      id: [s?.id ?? null],
      label: [s?.label ?? '', Validators.required],
      url: [s?.url ?? '', [Validators.required, this.swaggerUrlValidator]],
      baseUrl: [s?.baseUrl ?? '', Validators.required],
      isActive: [s?.isActive ?? true]
    });
  }

  addSource(): void { this.sourcesArray.push(this.newSourceGroup()); }

  removeSource(i: number): void { this.sourcesArray.removeAt(i); }

  ngOnInit(): void {
    if (this.isWorkbench) {
      this.scopeChangesSubscription = this.organization.changes$.subscribe(() => this.loadWorkbenchData());
      this.loadWorkbenchData();
      return;
    }
    this.api.getSystems(undefined, undefined, 1, 100).subscribe(res => { if (res.success) this.systems.set(res.data?.items ?? []); });
    this.loadEnvironments();
  }

  ngOnDestroy(): void {
    this.scopeChangesSubscription?.unsubscribe();
    this.workbenchLoadSubscription?.unsubscribe();
  }

  loadWorkbenchData(): void {
    this.workbenchLoadSubscription?.unsubscribe();
    this.environments.set([]);
    this.systems.set([]);
    this.selectedEnvironmentId.set(null);
    this.readError.set(null);
    this.syncResults.set({});
    if (!this.organization.ready()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.workbenchLoadSubscription = forkJoin({
      systems: this.api.getSystems(undefined, undefined, 1, 100),
      environments: this.api.getEnvironments()
    }).subscribe({
      next: result => {
        if (!result.systems.success || !result.systems.data || !result.environments.success || !result.environments.data) {
          this.readError.set('org.requestFailed');
          this.loading.set(false);
          return;
        }
        this.systems.set(result.systems.data.items);
        this.environments.set(result.environments.data.items);
        this.loading.set(false);
        this.syncWorkbenchSelection();
      },
      error: (error: HttpErrorResponse) => {
        this.readError.set(apiErrorKey(error.status));
        this.loading.set(false);
      }
    });
  }

  selectEnvironment(id: string | null): void {
    this.selectedEnvironmentId.set(id);
  }

  private syncWorkbenchSelection(): void {
    const selectedId = this.selectedEnvironmentId();
    const selected = this.filteredEnvs().find(environment => environment.id === selectedId);
    if (!selected) this.selectedEnvironmentId.set(this.filteredEnvs()[0]?.id ?? null);
  }

  loadEnvironments(): void {
    this.readError.set(null);
    this.loading.set(true);
    this.api.getEnvironments().subscribe({
      next: res => {
        if (res.success && res.data) {
          this.environments.set(res.data.items);
          if (this.isWorkbench) this.syncWorkbenchSelection();
        }
        else this.readError.set('org.requestFailed');
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => { this.readError.set(apiErrorKey(error.status)); this.loading.set(false); }
    });
  }

  statusOptions = [
    { label: 'Active', value: 'active' },
    { label: 'Inactive', value: 'inactive' }
  ];

  getEnvLabel(type: EnvironmentType): string { return type; }
  onSearch(e: Event): void {
    this.searchTerm.set((e.target as HTMLInputElement).value);
    if (this.isWorkbench) this.syncWorkbenchSelection();
  }
  onSysFilter(val: string | null): void {
    this.filterSystemId.set(val ?? '');
    if (this.isWorkbench) this.syncWorkbenchSelection();
  }
  onTypeFilter(val: string | null): void {
    this.filterEnvType.set(val ?? '');
    if (this.isWorkbench) this.syncWorkbenchSelection();
  }
  onStatusFilter(val: string | null): void {
    this.filterStatus.set(val ?? '');
    if (this.isWorkbench) this.syncWorkbenchSelection();
  }
  clearFilters(): void {
    this.filterSystemId.set(''); this.filterEnvType.set(''); this.filterStatus.set(''); this.searchTerm.set('');
    if (this.isWorkbench) this.syncWorkbenchSelection();
  }

  openForm(env?: EnvironmentDto): void {
    if (!this.organization.requireMutation('environments.manage')) return;
    this.editingId = env?.id ?? null;
    this.sourcesArray.clear();
    this.existingSourceIds.set([]);
    this.activeTab.set('single');
    this.form.reset({ systemId: env?.systemId ?? '', name: env?.name ?? '', environmentType: env?.environmentType ?? 'Development', swaggerUrl: env?.swaggerUrl ?? '', baseUrl: env?.baseUrl ?? '', isActive: env?.isActive ?? true });
    if (env?.id) {
      this.api.getSwaggerSources(env.id).subscribe(res => {
        if (res.success && res.data && res.data.length > 0) {
          this.existingSourceIds.set(res.data.map(s => s.id));
          res.data.forEach(s => this.sourcesArray.push(this.newSourceGroup(s)));
          this.activeTab.set('multi');
        }
      });
    }
    this.showForm = true;
  }

  closeForm(): void { this.showForm = false; }

  submit(): void {
    if (!this.organization.requireMutation('environments.manage')) return;
    if (this.form.invalid) return;
    this.saving.set(true);
    const { sources, ...envPayload } = this.form.value as any;
    // In multi-version mode, clear the legacy swaggerUrl since sources take over
    if (this.activeTab() === 'multi') {
      envPayload.swaggerUrl = null;
      envPayload.baseUrl = envPayload.baseUrl || '';
    }
    const obs = this.editingId ? this.api.updateEnvironment(this.editingId, envPayload) : this.api.createEnvironment(envPayload);
    obs.subscribe({
      next: res => {
        if (!res.success || !res.data) { this.saving.set(false); return; }
        const envId = res.data.id;
        this.saveSources(envId, sources ?? [], () => {
          this.closeForm();
          this.loadEnvironments();
          this.saving.set(false);
        });
      },
      error: () => this.saving.set(false)
    });
  }

  private saveSources(envId: string, sources: any[], done: () => void): void {
    const ops: any[] = [];
    const originalIds = new Set(this.existingSourceIds());
    const formIds = new Set(sources.filter(s => s.id).map((s: any) => s.id));

    // Delete removed sources
    originalIds.forEach(id => {
      if (!formIds.has(id)) ops.push(this.api.deleteSwaggerSource(envId, id));
    });

    // Create or update
    sources.forEach((s: any) => {
      const payload = { label: s.label, url: s.url, baseUrl: s.baseUrl, isActive: s.isActive };
      if (s.id) {
        ops.push(this.api.updateSwaggerSource(envId, s.id, payload));
      } else {
        ops.push(this.api.createSwaggerSource(envId, payload));
      }
    });

    if (ops.length === 0) { done(); return; }

    let remaining = ops.length;
    ops.forEach(op => op.subscribe({ next: () => { if (--remaining === 0) done(); }, error: () => { if (--remaining === 0) done(); } }));
  }

  sync(envId: string): void {
    if (!this.organization.requireMutation('swaggersync.run')) return;
    this.syncing.update(s => ({ ...s, [envId]: true }));
    this.syncResults.update(s => ({ ...s, [envId]: '' }));
    this.api.syncSwagger(envId).subscribe({
      next: res => {
        this.syncing.update(s => ({ ...s, [envId]: false }));
        if (res.success && res.data) {
          const d = res.data;
          this.syncResults.update(s => ({ ...s, [envId]: `✓ Synced: ${d.totalEndpoints} endpoints — +${d.newEndpoints} new, ~${d.modifiedEndpoints} modified, -${d.deletedEndpoints} deleted` }));
          this.loadEnvironments();
        } else {
          this.syncResults.update(s => ({ ...s, [envId]: `✗ ${res.message ?? 'Sync failed'}` }));
        }
      },
      error: err => {
        this.syncing.update(s => ({ ...s, [envId]: false }));
        this.syncResults.update(s => ({ ...s, [envId]: `✗ ${err?.error?.message ?? 'Sync failed'}` }));
      }
    });
  }

  delete(id: string): void {
    if (!this.organization.requireMutation('environments.manage')) return;
    if (!confirm('Delete this environment?')) return;
    this.api.deleteEnvironment(id).subscribe({ next: () => this.loadEnvironments() });
  }
}
