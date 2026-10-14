import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import {
  ApiStandardDto, Team, SystemDto, EnvironmentDto, ValidationRunDto, RunValidationRequest
} from '../../../core/models/models';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { apiErrorKey } from '../../../core/models/organization';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-validation-runner',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslatePipe],
  templateUrl: './validation-runner.component.html',
  styleUrls: ['./validation-runner.component.scss', '../governance-workspace.scss']
})
export class ValidationRunnerComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  readonly organization = inject(OrganizationContextService);
  readonly workbench = this.router.url.startsWith('/workbench');
  readonly baseRoute = this.workbench ? '/workbench/governance' : '/governance';
  readonly canRun = computed(() => this.organization.canMutate() && this.organization.hasPermission('governance.run'));
  errorKey = signal<string | null>(null);
  private fail(error?: { status?: number }): void {
    this.errorKey.set(apiErrorKey(error?.status ?? 500));
    this.loading.set(false);
    this.running.set(false);
  }

  standards = signal<ApiStandardDto[]>([]);
  teams = signal<Team[]>([]);
  systems = signal<SystemDto[]>([]);
  environments = signal<EnvironmentDto[]>([]);
  loading = signal(true);
  running = signal(false);
  result = signal<ValidationRunDto | null>(null);
  errorMessage = '';

  form = this.fb.group({
    standardId: [''],
    scopeType: ['all'],
    scopeTeamId: [''],
    scopeSystemId: [''],
    scopeEnvironmentId: [''],
    scopeEndpointId: ['']
  });

  ngOnInit(): void {
    const defaultStandardId = this.route.snapshot.queryParamMap.get('standardId') ?? '';

    this.api.getStandards(undefined, true, 1, 100).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        if (!r.success || !r.data) { this.fail(); return; }
        this.standards.set(r.data.items);
        if (defaultStandardId) this.form.patchValue({ standardId: defaultStandardId });
        this.loading.set(false);
      }, error: error => this.fail(error)
    });
    this.api.getTeams().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => { if (r.success) this.teams.set(r.data?.items ?? []); else this.fail(); }, error: error => this.fail(error)
    });
    this.api.getSystems().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => { if (r.success) this.systems.set(r.data?.items ?? []); else this.fail(); }, error: error => this.fail(error)
    });
    this.api.getEnvironments().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => { if (r.success) this.environments.set(r.data?.items ?? []); else this.fail(); }, error: error => this.fail(error)
    });
  }

  get scopeType(): string { return this.form.value.scopeType ?? 'all'; }

  run(): void {
    if (!this.organization.requireMutation('governance.run')) return;
    if (this.running()) return;
    const v = this.form.value;
    if (!v.standardId) { this.errorMessage = 'Please select a standard.'; return; }
    this.errorMessage = '';
    this.running.set(true);
    this.result.set(null);

    const payload: RunValidationRequest = { standardId: v.standardId };
    if (v.scopeType === 'team' && v.scopeTeamId) payload.scopeTeamId = v.scopeTeamId;
    if (v.scopeType === 'system' && v.scopeSystemId) payload.scopeSystemId = v.scopeSystemId;
    if (v.scopeType === 'environment' && v.scopeEnvironmentId) payload.scopeEnvironmentId = v.scopeEnvironmentId;
    if (v.scopeType === 'endpoint' && v.scopeEndpointId) payload.scopeEndpointId = v.scopeEndpointId;

    this.api.runValidation(payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.running.set(false);
        if (res.success && res.data) this.result.set(res.data);
        else if (res.success) this.fail();
        else this.errorMessage = res.message ?? 'Validation failed.';
      },
      error: error => this.fail(error)
    });
  }

  viewReport(): void {
    if (this.result()?.id) this.router.navigate([this.baseRoute, 'runs', this.result()!.id, 'report']);
  }

  scoreClass(score: number): string {
    if (score >= 80) return 'score-high';
    if (score >= 50) return 'score-mid';
    return 'score-low';
  }
}
