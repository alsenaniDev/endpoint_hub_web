import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import {
  ApiStandardDto, ApiStandardRuleDto, ApiStandardAssignmentDto,
  ValidationRunDto, RuleType, RuleTarget, ValidationSeverity, AssignmentScope,
  Team, SystemDto, EnvironmentDto
} from '../../../core/models/models';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { apiErrorKey } from '../../../core/models/organization';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-governance-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, LoadingComponent, PermissionDirective, TranslatePipe],
  templateUrl: './governance-detail.component.html',
  styleUrls: ['./governance-detail.component.scss', '../governance-workspace.scss']
})
export class GovernanceDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private organization = inject(OrganizationContextService);
  private destroyRef = inject(DestroyRef);
  @Input() sourceStandardId?: string;
  @Input() embedded = false;
  @Output() standardChanged = new EventEmitter<void>();
  readonly workbench = inject(Router).url.startsWith('/workbench');
  readonly structuralOnly = this.organization.structuralOnly;
  readonly canRun = computed(() => this.organization.canMutate() && this.organization.hasPermission('governance.run'));
  readonly baseRoute = this.workbench ? '/workbench/governance' : '/governance';
  selectedRuleId = signal<string | null>(null);
  selectedRule = computed(() => this.rules().find(rule => rule.id === this.selectedRuleId()) ?? null);
  policySearch = '';
  policyStatus = '';
  runsPage = 1;
  runsTotal = 0;
  get filteredRules(): ApiStandardRuleDto[] {
    return this.rules().filter(rule => (!this.policyStatus || rule.isActive === (this.policyStatus === 'active'))
      && (this.structuralOnly() || !this.policySearch
        || `${rule.ruleName} ${rule.target} ${rule.ruleType}`.toLowerCase().includes(this.policySearch.toLowerCase())));
  }
  readonly canManage = computed(() => this.organization.canMutate() && this.organization.hasPermission('governance.manage'));
  readonly canDeleteRun = computed(() => this.organization.canMutate() && this.organization.hasPermission('governance.manage'));
  errorKey = signal<string | null>(null);
  private fail(error?: { status?: number }): void {
    this.errorKey.set(apiErrorKey(error?.status ?? 500));
    this.loading.set(false);
    this.saving.set(false);
  }

  standardId = '';
  standard = signal<ApiStandardDto | null>(null);
  rules = signal<ApiStandardRuleDto[]>([]);
  assignments = signal<ApiStandardAssignmentDto[]>([]);
  runs = signal<ValidationRunDto[]>([]);
  loading = signal(true);
  saving = signal(false);
  activeTab: 'rules' | 'assignments' | 'runs' = 'rules';

  // Rule form
  showRuleForm = false;
  editingRuleId: string | null = null;
  ruleForm = this.fb.group({
    ruleName: ['', [Validators.required, Validators.maxLength(200)]],
    ruleDescription: [''],
    ruleType: ['Regex' as RuleType, Validators.required],
    target: ['Path' as RuleTarget, Validators.required],
    expression: [''],
    severity: ['Error' as ValidationSeverity, Validators.required],
    errorMessage: ['', Validators.required],
    suggestedFix: [''],
    isActive: [true]
  });

  // Assignment form
  showAssignmentForm = false;
  assignmentForm = this.fb.group({
    scope: ['Team' as AssignmentScope, Validators.required],
    scopeId: ['', Validators.required]
  });
  scopeOptions: { id: string; name: string }[] = [];
  teams: Team[] = [];
  systems: SystemDto[] = [];
  environments: EnvironmentDto[] = [];

  readonly ruleTypes: RuleType[] = ['Regex', 'RequiredField', 'ResponseSchema', 'HttpMethod', 'StatusCode', 'CustomExpression', 'Pagination'];
  readonly ruleTargets: RuleTarget[] = ['Path', 'Method', 'Summary', 'Description', 'Tag', 'OperationId', 'ResponseSchema', 'StatusCode', 'Parameters', 'Security', 'Headers'];
  readonly severities: ValidationSeverity[] = ['Info', 'Warning', 'Error', 'Critical'];
  readonly scopes: AssignmentScope[] = ['Team', 'System', 'Environment', 'SwaggerSource'];

  ngOnInit(): void {
    this.standardId = this.sourceStandardId ?? this.route.snapshot.paramMap.get('id') ?? '';
    this.loadAll();
    this.loadScopeData();
  }

  loadAll(): void {
    this.loading.set(true);
    this.errorKey.set(null);
    forkJoin({
      standard: this.api.getStandard(this.standardId),
      rules: this.api.getRules(this.standardId),
      assignments: this.api.getAssignments(this.standardId),
      runs: this.api.getValidationRuns(this.standardId, this.runsPage)
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        if (!res.standard.success || !res.standard.data || !res.rules.success || !res.assignments.success || !res.runs.success) { this.fail(); return; }
        this.standard.set(res.standard.data ?? null);
        this.rules.set(res.rules.data ?? []);
        if (!this.rules().some(rule => rule.id === this.selectedRuleId())) this.selectedRuleId.set(this.rules()[0]?.id ?? null);
        this.assignments.set(res.assignments.data ?? []);
        this.runs.set(res.runs.data?.items ?? []);
        this.runsTotal = res.runs.data?.totalCount ?? 0;
        this.loading.set(false);
      },
      error: error => this.fail(error)
    });
  }

  loadScopeData(): void {
    if (!this.canManage()) return;
    forkJoin({ teams: this.api.getTeams(), systems: this.api.getSystems(), environments: this.api.getEnvironments() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        if (!res.teams.success || !res.systems.success || !res.environments.success) { this.fail(); return; }
        this.teams = res.teams.data?.items ?? [];
        this.systems = res.systems.data?.items ?? [];
        this.environments = res.environments.data?.items ?? [];
      },
      error: error => this.fail(error)
    });
  }

  // ── Rules ──────────────────────────────────────────────────────────────────
  openRuleForm(rule?: ApiStandardRuleDto): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    this.editingRuleId = rule?.id ?? null;
    this.ruleForm.reset({
      ruleName: rule?.ruleName ?? '',
      ruleDescription: rule?.ruleDescription ?? '',
      ruleType: rule?.ruleType ?? 'Regex',
      target: rule?.target ?? 'Path',
      expression: rule?.expression ?? '',
      severity: rule?.severity ?? 'Error',
      errorMessage: rule?.errorMessage ?? '',
      suggestedFix: rule?.suggestedFix ?? '',
      isActive: rule?.isActive ?? true
    });
    this.showRuleForm = true;
  }

  closeRuleForm(): void { this.showRuleForm = false; this.editingRuleId = null; }

  submitRule(): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    if (this.ruleForm.invalid) return;
    this.saving.set(true);
    const v = this.ruleForm.getRawValue();
    const payload = { ruleName: v.ruleName!, ruleDescription: v.ruleDescription ?? undefined,
      ruleType: v.ruleType!, target: v.target!, expression: v.expression ?? undefined, severity: v.severity!,
      errorMessage: v.errorMessage!, suggestedFix: v.suggestedFix ?? undefined, isActive: v.isActive === true };
    const obs = this.editingRuleId
      ? this.api.updateRule(this.editingRuleId, payload)
      : this.api.createRule(this.standardId, payload);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => { if (!res.success) { this.fail(); return; } this.closeRuleForm(); this.loadAll(); this.standardChanged.emit(); this.saving.set(false); },
      error: error => this.fail(error)
    });
  }

  deleteRule(id: string): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    if (!confirm('Delete this rule?')) return;
    this.api.deleteRule(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: res => { if (res.success) { this.loadAll(); this.standardChanged.emit(); } else this.fail(); }, error: error => this.fail(error) });
  }

  // ── Assignments ────────────────────────────────────────────────────────────
  openAssignmentForm(): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    this.assignmentForm.reset({ scope: 'Team', scopeId: '' });
    this.updateScopeOptions('Team');
    this.showAssignmentForm = true;
  }

  closeAssignmentForm(): void { this.showAssignmentForm = false; }

  onScopeChange(e: Event): void {
    const scope = (e.target as HTMLSelectElement).value as AssignmentScope;
    this.assignmentForm.patchValue({ scopeId: '' });
    this.updateScopeOptions(scope);
  }

  updateScopeOptions(scope: AssignmentScope): void {
    switch (scope) {
      case 'Team': this.scopeOptions = this.teams.map(t => ({ id: t.id, name: t.name })); break;
      case 'System': this.scopeOptions = this.systems.map(s => ({ id: s.id, name: `${s.teamName} / ${s.name}` })); break;
      case 'Environment': this.scopeOptions = this.environments.map(e => ({ id: e.id, name: `${e.systemName} / ${e.name}` })); break;
      default: this.scopeOptions = [];
    }
  }

  submitAssignment(): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    if (this.assignmentForm.invalid) return;
    this.saving.set(true);
    const v = this.assignmentForm.getRawValue();
    this.api.createAssignment(this.standardId, { scope: v.scope!, scopeId: v.scopeId! }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        if (!res.success) { this.fail(); return; }
        this.closeAssignmentForm();
        this.loadAll();
        this.standardChanged.emit();
        this.saving.set(false);
      },
      error: error => this.fail(error)
    });
  }

  removeAssignment(id: string): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    if (!confirm('Remove this assignment?')) return;
    this.api.removeAssignment(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: res => { if (res.success) { this.loadAll(); this.standardChanged.emit(); } else this.fail(); }, error: error => this.fail(error) });
  }

  deleteRun(id: string): void {
    if (!this.organization.requireMutation('governance.manage')) return;
    if (!confirm('Delete this validation run and all its results?')) return;
    this.api.deleteValidationRun(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        if (res.success) this.loadAll(); else this.fail();
      },
      error: error => this.fail(error)
    });
  }

  changeRunsPage(delta: number): void {
    const page = this.runsPage + delta;
    if (page < 1 || page > Math.ceil(this.runsTotal / 20)) return;
    this.runsPage = page;
    this.loadAll();
  }

  severityClass(s: ValidationSeverity): string {
    return { Info: 'badge-info', Warning: 'badge-warning', Error: 'badge-error', Critical: 'badge-critical' }[s] ?? '';
  }

  statusClass(s: string): string {
    return { Completed: 'badge-active', Failed: 'badge-error', Running: 'badge-warning', Pending: 'badge-info' }[s] ?? '';
  }
}
