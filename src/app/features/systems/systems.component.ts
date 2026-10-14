import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { Router, RouterModule } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { EnvironmentDto, SystemDto, Team } from '../../core/models/models';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { apiErrorKey } from '../../core/models/organization';

@Component({
  selector: 'app-systems',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DropdownModule, RouterModule, LoadingComponent, TranslatePipe],
  templateUrl: './systems.component.html',
  styleUrls: ['./systems.component.scss']
})
export class SystemsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  auth = inject(AuthService);
  readonly organization = inject(OrganizationContextService);
  readonly readError = signal<string | null>(null);
  private fb = inject(FormBuilder);
  readonly isWorkbench = inject(Router).url.startsWith('/workbench');

  systems = signal<SystemDto[]>([]);
  teams = signal<Team[]>([]);
  relatedEnvironments = signal<EnvironmentDto[] | null>(null);
  loading = signal(true);
  relatedLoading = signal(false);
  relatedError = signal<string | null>(null);
  selectedSystemId = signal<string | null>(null);
  readonly selectedSystem = computed(() =>
    this.systems().find(system => system.id === this.selectedSystemId()) ?? null
  );
  readonly selectedEndpointCount = computed(() =>
    (this.relatedEnvironments() ?? []).reduce((total, environment) => total + environment.endpointCount, 0)
  );
  saving = signal(false);
  showForm = false;
  editingId: string | null = null;
  filterTeamId: string | null = null;
  private get selectedTeamId(): string { return this.filterTeamId ?? ''; }
  searchTerm = '';
  private scopeChangesSubscription?: Subscription;
  private scopeRequest?: Subscription;
  private systemsRequest?: Subscription;
  private environmentRequest?: Subscription;

  form = this.fb.group({
    teamId: ['', Validators.required],
    name: ['', Validators.required],
    description: [''],
    ownerName: ['', Validators.required],
    ownerEmail: ['', Validators.email],
    ownerContact: [''],
    repositoryUrl: ['']
  });

  ngOnInit(): void {
    if (this.isWorkbench) {
      this.scopeChangesSubscription = this.organization.changes$.subscribe(() => this.loadWorkbenchData());
      this.loadWorkbenchData();
      return;
    }
    this.api.getTeams('', 1, 100).subscribe(res => { if (res.success) this.teams.set(res.data?.items ?? []); });
    this.loadSystems();
  }

  ngOnDestroy(): void {
    this.scopeChangesSubscription?.unsubscribe();
    this.scopeRequest?.unsubscribe();
    this.systemsRequest?.unsubscribe();
    this.environmentRequest?.unsubscribe();
  }

  loadWorkbenchData(): void {
    this.scopeRequest?.unsubscribe();
    this.systemsRequest?.unsubscribe();
    this.environmentRequest?.unsubscribe();
    this.systems.set([]);
    this.teams.set([]);
    this.selectedSystemId.set(null);
    this.relatedEnvironments.set(null);
    this.relatedError.set(null);
    this.readError.set(null);
    if (!this.organization.ready()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.scopeRequest = forkJoin({
      teams: this.api.getTeams('', 1, 100),
      systems: this.api.getSystems(this.selectedTeamId || undefined, this.searchTerm || undefined)
    }).subscribe({
      next: result => {
        this.teams.set(result.teams.success ? result.teams.data?.items ?? [] : []);
        if (!result.teams.success || !result.systems.success || !result.systems.data) {
          this.readError.set('org.requestFailed');
          this.loading.set(false);
          return;
        }
        this.systems.set(result.systems.data.items);
        this.loading.set(false);
        this.selectSystem(result.systems.data.items[0]?.id ?? null);
      },
      error: (error: HttpErrorResponse) => {
        this.readError.set(apiErrorKey(error.status));
        this.loading.set(false);
      }
    });
  }

  loadSystems(): void {
    if (this.isWorkbench) {
      this.systemsRequest?.unsubscribe();
      this.loading.set(true);
      this.readError.set(null);
      this.systemsRequest = this.api.getSystems(this.selectedTeamId || undefined, this.searchTerm || undefined).subscribe({
        next: res => {
          if (!res.success || !res.data) {
            this.systems.set([]);
            this.selectedSystemId.set(null);
            this.relatedEnvironments.set(null);
            this.readError.set('org.requestFailed');
          } else {
            const selectedId = this.selectedSystemId();
            this.systems.set(res.data.items);
            if (!res.data.items.some(system => system.id === selectedId)) {
              this.selectSystem(res.data.items[0]?.id ?? null);
            }
          }
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.systems.set([]);
          this.selectedSystemId.set(null);
          this.relatedEnvironments.set(null);
          this.readError.set(apiErrorKey(error.status));
          this.loading.set(false);
        }
      });
      return;
    }
    this.readError.set(null);
    this.loading.set(true);
    this.api.getSystems(this.selectedTeamId || undefined, this.searchTerm || undefined).subscribe({
      next: res => {
        if (res.success && res.data) this.systems.set(res.data.items);
        else this.readError.set('org.requestFailed');
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => { this.readError.set(apiErrorKey(error.status)); this.loading.set(false); }
    });
  }

  onTeamFilter(val: string | null): void { this.filterTeamId = val; this.loadSystems(); }
  onSearch(e: Event): void { this.searchTerm = (e.target as HTMLInputElement).value; this.loadSystems(); }

  selectSystem(id: string | null): void {
    this.selectedSystemId.set(id);
    this.relatedEnvironments.set(null);
    this.relatedError.set(null);
    this.environmentRequest?.unsubscribe();
    if (!id || !this.isWorkbench || !this.organization.ready()) {
      this.relatedLoading.set(false);
      return;
    }
    this.relatedLoading.set(true);
    this.environmentRequest = this.api.getEnvironments(id).subscribe({
      next: res => {
        if (res.success && res.data) this.relatedEnvironments.set(res.data.items);
        else this.relatedError.set('org.requestFailed');
        this.relatedLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.relatedError.set(apiErrorKey(error.status));
        this.relatedLoading.set(false);
      }
    });
  }

  openForm(sys?: SystemDto): void {
    if (!this.organization.requireMutation('systems.manage')) return;
    this.editingId = sys?.id ?? null;
    this.form.reset({ teamId: sys?.teamId ?? '', name: sys?.name ?? '', description: sys?.description ?? '', ownerName: sys?.ownerName ?? '', ownerEmail: sys?.ownerEmail ?? '', ownerContact: '', repositoryUrl: sys?.repositoryUrl ?? '' });
    this.showForm = true;
  }

  closeForm(): void { this.showForm = false; }

  submit(): void {
    if (!this.organization.requireMutation('systems.manage')) return;
    if (this.form.invalid) return;
    this.saving.set(true);
    const payload = this.form.value as any;
    const obs = this.editingId ? this.api.updateSystem(this.editingId, payload) : this.api.createSystem(payload);
    obs.subscribe({ next: () => { this.closeForm(); this.loadSystems(); this.saving.set(false); }, error: () => this.saving.set(false) });
  }

  delete(id: string): void {
    if (!this.organization.requireMutation('systems.manage')) return;
    if (!confirm('Delete this system? This will remove all related environments and endpoints.')) return;
    this.api.deleteSystem(id).subscribe({ next: () => this.loadSystems() });
  }
}
