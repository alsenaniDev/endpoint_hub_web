import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, switchMap, Subject } from 'rxjs';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ApiStandardDto } from '../../../core/models/models';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { apiErrorKey } from '../../../core/models/organization';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { GovernanceDetailComponent } from '../governance-detail/governance-detail.component';

@Component({
  selector: 'app-governance-standards',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, LoadingComponent, PermissionDirective, TranslatePipe, GovernanceDetailComponent],
  templateUrl: './governance-standards.component.html',
  styleUrls: ['./governance-standards.component.scss', '../governance-workspace.scss']
})
export class GovernanceStandardsComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  private reload = new Subject<void>();
  readonly organization = inject(OrganizationContextService);
  readonly workbench = inject(Router).url.startsWith('/workbench');
  readonly structuralOnly = this.organization.structuralOnly;
  readonly canManage = computed(() => this.organization.canMutate() && this.organization.hasPermission('governance.manage'));
  errorKey = signal<string | null>(null);
  selectedId = signal<string | null>(null);
  selectedStandards = computed(() => this.standards().filter(s => s.id === this.selectedId()));
  statusFilter: boolean | undefined;

  standards = signal<ApiStandardDto[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = false;
  editingId: string | null = null;
  search = '';
  totalCount = 0;
  page = 1;
  pageSize = 20;

  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: [''],
    isActive: [true]
  });

  ngOnInit(): void {
    this.reload.pipe(
      switchMap(() => this.api.getStandards(this.structuralOnly() ? undefined : this.search || undefined,
        this.statusFilter, this.page, this.pageSize).pipe(
          catchError(error => { this.fail(error); return EMPTY; }))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: res => {
        this.loading.set(false);
        if (!res.success || !res.data) { this.fail(); return; }
        this.standards.set(res.data.items);
        this.totalCount = res.data.totalCount;
        if (!res.data.items.some(s => s.id === this.selectedId())) this.selectedId.set(res.data.items[0]?.id ?? null);
      },
      error: error => this.fail(error)
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorKey.set(null);
    this.reload.next();
  }

  refreshList(): void {
    this.errorKey.set(null);
    this.reload.next();
  }

  openForm(std?: ApiStandardDto): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    this.editingId = std?.id ?? null;
    this.form.reset({ name: std?.name ?? '', description: std?.description ?? '', isActive: std?.isActive ?? true });
    this.showForm = true;
  }

  closeForm(): void { this.showForm = false; this.editingId = null; }

  submit(): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    if (this.form.invalid) return;
    this.saving.set(true);
    const values = this.form.getRawValue();
    const payload = { name: values.name!, description: values.description ?? undefined, isActive: values.isActive === true };
    const obs = this.editingId
      ? this.api.updateStandard(this.editingId, payload)
      : this.api.createStandard(payload);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => { if (!res.success) { this.fail(); return; } this.closeForm(); this.load(); this.saving.set(false); },
      error: error => this.fail(error)
    });
  }

  delete(id: string): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    if (!confirm('Delete this standard? All associated rules and assignments will be removed.')) return;
    this.api.deleteStandard(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => { if (res.success) this.load(); else this.fail(); }, error: error => this.fail(error)
    });
  }

  private fail(error?: { status?: number }): void {
    this.errorKey.set(apiErrorKey(error?.status ?? 500));
    this.loading.set(false);
    this.saving.set(false);
  }

  onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.statusFilter = value === '' ? undefined : value === 'true';
    this.page = 1;
    this.load();
  }

  trackStandard(_: number, standard: ApiStandardDto): string { return standard.id; }

  onSearch(e: Event): void {
    this.search = (e.target as HTMLInputElement).value;
    this.page = 1;
    this.load();
  }

  get totalPages(): number { return Math.ceil(this.totalCount / this.pageSize); }
  prev(): void { if (this.page > 1) { this.page--; this.load(); } }
  next(): void { if (this.page < this.totalPages) { this.page++; this.load(); } }
}
