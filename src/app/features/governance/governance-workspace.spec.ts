import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { ApiResponse, ApiStandardDto, ApiStandardRuleDto, ComplianceReportDto, PagedResult } from '../../core/models/models';
import { ApiService } from '../../core/services/api.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { TranslateService } from '../../core/services/translate.service';
import { GovernanceStandardsComponent } from './governance-standards/governance-standards.component';
import { GovernanceDetailComponent } from './governance-detail/governance-detail.component';
import { ValidationRunnerComponent } from './validation-runner/validation-runner.component';
import { ComplianceReportComponent } from './compliance-report/compliance-report.component';

const standard: ApiStandardDto = {
  id: 'standard-a', name: 'API conventions', description: 'Private standard description',
  isActive: true, ruleCount: 2, assignmentCount: 1, createdAt: '2026-10-01T10:00:00Z'
};
const rule: ApiStandardRuleDto = {
  id: 'rule-a', standardId: standard.id, ruleName: 'Path conventions', ruleDescription: 'Private rule description',
  ruleType: 'Regex', target: 'Path', expression: '^/api/', severity: 'Error',
  errorMessage: 'Private failure message', suggestedFix: 'Private remediation',
  isActive: true, createdAt: standard.createdAt
};
const run = {
  id: 'run-a', standardId: standard.id, standardName: standard.name, status: 'Completed' as const,
  totalEndpoints: 2, passedEndpoints: 1, failedEndpoints: 1, overallComplianceScore: 50, createdAt: standard.createdAt
};
const report: ComplianceReportDto = {
  runId: run.id, standardId: standard.id, standardName: standard.name, runDate: standard.createdAt,
  totalEndpoints: 2, passedEndpoints: 1, failedEndpoints: 1, overallScore: 50,
  severityBreakdown: [{ severity: 'Error', failedCount: 1 }],
  endpointSummaries: [{
    endpointId: 'endpoint-a', path: '/private/path', method: 'GET', tag: 'Private tag',
    complianceScore: 50, passedRules: 1, failedRules: 1, skippedRules: 0, errors: 1, warnings: 0,
    violations: [{ id: 'finding-a', endpointId: 'endpoint-a', endpointPath: '/private/path',
      endpointMethod: 'GET', ruleId: rule.id, ruleName: rule.ruleName, ruleType: rule.ruleType,
      status: 'Failed', severity: 'Error', message: rule.errorMessage, suggestedFix: rule.suggestedFix }]
  }]
};
function paged<T>(items: T[], totalCount = items.length): PagedResult<T> {
  return { items, totalCount, pageNumber: 1, pageSize: 20, totalPages: Math.ceil(totalCount / 20),
    hasNextPage: totalCount > 20, hasPreviousPage: false };
}

describe('Governance policy presentation migration', () => {
  let api: jasmine.SpyObj<ApiService>;
  let permissions: Set<string>;
  let structural: ReturnType<typeof signal<boolean>>;
  let requireMutation: jasmine.Spy;

  beforeEach(async () => {
    permissions = new Set(['governance.view']);
    structural = signal(false);
    requireMutation = jasmine.createSpy().and.callFake((key: string) => !structural() && permissions.has(key));
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getStandards', 'getStandard', 'getRules', 'getAssignments', 'getValidationRuns', 'getComplianceReport',
      'getTeams', 'getSystems', 'getEnvironments', 'createStandard', 'updateStandard', 'deleteStandard',
      'createRule', 'updateRule', 'deleteRule', 'createAssignment', 'removeAssignment', 'deleteValidationRun', 'runValidation'
    ]);
    api.getStandards.and.returnValue(of({ success: true, data: paged([standard, { ...standard, id: 'standard-b', name: 'Response standards' }]) }));
    api.getStandard.and.callFake(id => of({ success: true, data: { ...standard, id,
      name: id === standard.id ? standard.name : 'Response standards' } }));
    api.getRules.and.returnValue(of({ success: true, data: [rule, { ...rule, id: 'rule-b',
      ruleName: 'Response schema', ruleType: 'ResponseSchema', target: 'ResponseSchema', isActive: false }] }));
    api.getAssignments.and.returnValue(of({ success: true, data: [{
      id: 'assignment-a', standardId: standard.id, standardName: standard.name,
      scope: 'Team', scopeId: 'team-a', scopeName: 'Private platform team'
    }] }));
    api.getValidationRuns.and.returnValue(of({ success: true, data: paged([run]) }));
    api.getComplianceReport.and.returnValue(of({ success: true, data: report }));
    api.getTeams.and.returnValue(of({ success: true, data: paged([]) }));
    api.getSystems.and.returnValue(of({ success: true, data: paged([]) }));
    api.getEnvironments.and.returnValue(of({ success: true, data: paged([]) }));
    api.createStandard.and.returnValue(of({ success: true, data: standard }));
    api.updateStandard.and.returnValue(of({ success: true, data: standard }));
    api.deleteStandard.and.returnValue(of({ success: true }));
    api.createRule.and.returnValue(of({ success: true, data: rule }));
    api.updateRule.and.returnValue(of({ success: true, data: rule }));
    api.deleteRule.and.returnValue(of({ success: true }));
    api.createAssignment.and.returnValue(of({ success: true }));
    api.removeAssignment.and.returnValue(of({ success: true }));
    api.deleteValidationRun.and.returnValue(of({ success: true }));
    api.runValidation.and.returnValue(of({ success: true, data: run }));
    await TestBed.configureTestingModule({
      imports: [GovernanceStandardsComponent, GovernanceDetailComponent, ValidationRunnerComponent, ComplianceReportComponent],
      providers: [provideRouter([
        ...['governance', 'workbench/governance'].flatMap(path => [
          { path, component: GovernanceStandardsComponent },
          { path: `${path}/standards/:id`, component: GovernanceDetailComponent },
          { path: `${path}/validate`, component: ValidationRunnerComponent },
          { path: `${path}/runs/:runId/report`, component: ComplianceReportComponent }
        ])
      ]), { provide: ApiService, useValue: api },
      { provide: OrganizationContextService, useValue: {
        structuralOnly: structural, canMutate: () => !structural(),
        hasPermission: (key: string) => permissions.has(key), requireMutation,
        activeOrganization: signal({ id: 'org-a', name: 'Platform organization' }), activeOrganizationId: signal('org-a')
      } },
      { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }]
    }).compileComponents();
  });

  async function render(url = '/workbench/governance') {
    const harness = await RouterTestingHarness.create(url);
    harness.detectChanges();
    return { harness, element: harness.routeNativeElement! };
  }

  it('replaces the card grid and statistics cards with explorer, policy table, selected detail and evidence', async () => {
    const { element } = await render();
    expect(element.querySelector('.card-grid, .page-header, .stats-row')).toBeNull();
    for (const selector of ['.gov-explorer', '.gov-policy-table', '.gov-policy-detail', '.gov-evidence']) {
      expect(element.querySelector(selector)).withContext(selector).not.toBeNull();
    }
    expect(element.textContent).toContain('Platform organization');
    expect(api.getStandard).toHaveBeenCalledWith(standard.id);
    expect(api.getTeams).not.toHaveBeenCalled();
    expect(api.runValidation).not.toHaveBeenCalled();
  });

  it('retains the legacy standards composition without embedding new details', async () => {
    const { element } = await render('/governance');
    expect(element.querySelector('.card-grid')).not.toBeNull();
    expect(element.querySelector('.gov-explorer')).toBeNull();
    expect(api.getStandard).not.toHaveBeenCalled();
  });

  it('selects another standard using the same scoped detail component', async () => {
    const { harness, element } = await render();
    (element.querySelectorAll('.gov-resource')[1] as HTMLButtonElement).click();
    harness.detectChanges();
    expect(api.getStandard).toHaveBeenCalledWith('standard-b');
    expect(element.querySelector('.gov-context h2')?.textContent).toContain('Response standards');
  });

  it('selects policies and filters their existing targets and active state locally', async () => {
    const { harness, element } = await render();
    const search = element.querySelector('.gov-table-tools input') as HTMLInputElement;
    search.value = 'ResponseSchema';
    search.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(element.querySelectorAll('.gov-policy-table tbody tr').length).toBe(1);
    (element.querySelector('.gov-policy-select') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(element.querySelector('.gov-policy-detail')?.textContent).toContain('rule-b');
    expect(api.runValidation).not.toHaveBeenCalled();
  });

  it('applies the existing server search and status filters while resetting pagination', async () => {
    const { harness, element } = await render();
    const component = harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent;
    component.page = 3;
    const search = element.querySelector('.gov-explorer input') as HTMLInputElement;
    search.value = 'API';
    search.dispatchEvent(new Event('input'));
    expect(api.getStandards).toHaveBeenCalledWith('API', undefined, 1, 20);
    const select = element.querySelector('.gov-explorer select') as HTMLSelectElement;
    select.value = 'true';
    select.dispatchEvent(new Event('change'));
    expect(api.getStandards).toHaveBeenCalledWith('API', true, 1, 20);
  });

  it('preserves server pagination', async () => {
    api.getStandards.and.returnValue(of({ success: true, data: paged([standard], 41) }));
    const { harness } = await render();
    const component = harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent;
    component.next();
    expect(api.getStandards).toHaveBeenCalledWith(undefined, undefined, 2, 20);
    component.prev();
    expect(component.page).toBe(1);
  });

  it('renders loading and an honest empty state without a create action for read-only capabilities', async () => {
    const pending = new Subject<ApiResponse<PagedResult<ApiStandardDto>>>();
    api.getStandards.and.returnValue(pending);
    const { harness, element } = await render();
    expect(element.textContent).toContain('gov.loading');
    pending.next({ success: true, data: paged([]) });
    harness.detectChanges();
    expect(element.textContent).toContain('gov.emptyTitle');
    expect(element.querySelector('.gov-state .btn-primary')).toBeNull();
    expect(api.getStandard).not.toHaveBeenCalled();
  });

  it('shows backend forbidden, clears the workspace, and can retry after a failed read', async () => {
    api.getStandards.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const { harness, element } = await render();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('org.forbidden');
    expect(element.querySelector('.gov-policy-table')).toBeNull();
    api.getStandards.and.returnValue(of({ success: true, data: paged([standard]) }));
    (harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent).load();
    harness.detectChanges();
    expect(element.querySelector('.gov-policy-table')).not.toBeNull();
  });

  it('does not treat an unsuccessful API response as a successful empty state', async () => {
    api.getStandards.and.returnValue(of({ success: false }));
    const { element } = await render();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.textContent).not.toContain('gov.emptyTitle');
  });

  it('redacts arbitrary policy text and configuration for a structural-only Viewer', async () => {
    structural.set(true);
    const { harness, element } = await render();
    expect(element.textContent).toContain(standard.id);
    expect(element.textContent).toContain(rule.id);
    for (const text of [standard.name, standard.description!, rule.ruleName, rule.ruleDescription!,
      rule.expression!, rule.errorMessage, rule.suggestedFix!]) expect(element.textContent).not.toContain(text);
    expect(element.querySelector('input[type="search"], .gov-resource-actions, .gov-code')).toBeNull();
    (element.querySelectorAll('.gov-tabs button')[1] as HTMLButtonElement).click();
    harness.detectChanges();
    expect(element.textContent).toContain('team-a');
    expect(element.textContent).not.toContain('Private platform team');
    expect(api.getTeams).not.toHaveBeenCalled();
  });

  it('refuses standard mutation callbacks without permission', async () => {
    const { harness } = await render();
    const component = harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent;
    component.openForm(standard);
    component.form.setValue({ name: 'Changed', description: '', isActive: true });
    component.submit();
    component.delete(standard.id);
    expect(component.showForm).toBeFalse();
    expect(api.createStandard).not.toHaveBeenCalled();
    expect(api.updateStandard).not.toHaveBeenCalled();
    expect(api.deleteStandard).not.toHaveBeenCalled();
    expect(requireMutation).toHaveBeenCalledWith('governance.manage');
  });

  it('preserves authorized standard validation, payload and drawer submission', async () => {
    permissions.add('governance.manage');
    const { harness, element } = await render();
    const component = harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent;
    component.openForm();
    harness.detectChanges();
    expect(element.querySelector('.gov-drawer[role="dialog"]')).not.toBeNull();
    component.submit();
    expect(api.createStandard).not.toHaveBeenCalled();
    component.form.setValue({ name: 'New policy standard', description: 'Description', isActive: true });
    component.submit();
    expect(api.createStandard).toHaveBeenCalledWith({ name: 'New policy standard', description: 'Description', isActive: true });
    expect(component.showForm).toBeFalse();
  });

  it('keeps an unsuccessful standard save open and exposes the error', async () => {
    permissions.add('governance.manage');
    api.updateStandard.and.returnValue(of({ success: false }));
    const { harness } = await render();
    const component = harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent;
    component.openForm(standard);
    component.submit();
    expect(component.showForm).toBeTrue();
    expect(component.errorKey()).not.toBeNull();
    expect(component.saving()).toBeFalse();
  });

  it('retains delete confirmation and refuses the API call when cancelled', async () => {
    permissions.add('governance.manage');
    const { harness } = await render();
    spyOn(window, 'confirm').and.returnValue(false);
    (harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent).delete(standard.id);
    expect(api.deleteStandard).not.toHaveBeenCalled();
  });

  it('loads the parallel detail route and keeps evaluation/report links inside Workbench', async () => {
    permissions.add('governance.run');
    const { harness, element } = await render('/workbench/governance/standards/standard-a');
    expect(element.querySelector('a[href="/workbench/governance/validate?standardId=standard-a"]')).not.toBeNull();
    const component = harness.routeDebugElement!.componentInstance as GovernanceDetailComponent;
    component.activeTab = 'runs';
    harness.detectChanges();
    expect(element.querySelector('a[href="/workbench/governance/runs/run-a/report"]')).not.toBeNull();
    expect(api.runValidation).not.toHaveBeenCalled();
  });

  it('shows explicit detail-read errors instead of stale policy content', async () => {
    api.getRules.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const { element } = await render('/workbench/governance/standards/standard-a');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('org.forbidden');
    expect(element.querySelector('.gov-policy-table')).toBeNull();
  });

  it('preserves rule validation, edit payload and assignment callbacks under existing management permission', async () => {
    permissions.add('governance.manage');
    const { harness } = await render('/workbench/governance/standards/standard-a');
    const component = harness.routeDebugElement!.componentInstance as GovernanceDetailComponent;
    component.openRuleForm();
    component.submitRule();
    expect(api.createRule).not.toHaveBeenCalled();
    component.openRuleForm(rule);
    component.submitRule();
    expect(api.updateRule).toHaveBeenCalledWith(rule.id, jasmine.objectContaining({
      ruleName: rule.ruleName, expression: rule.expression, severity: rule.severity, target: rule.target
    }));
    component.openAssignmentForm();
    component.assignmentForm.patchValue({ scope: 'Team', scopeId: 'team-a' });
    component.submitAssignment();
    expect(api.createAssignment).toHaveBeenCalledWith(standard.id, { scope: 'Team', scopeId: 'team-a' });
  });

  it('blocks direct rule, assignment and run deletion callbacks for Viewer', async () => {
    structural.set(true);
    permissions.add('governance.manage');
    const { harness } = await render('/workbench/governance/standards/standard-a');
    const component = harness.routeDebugElement!.componentInstance as GovernanceDetailComponent;
    component.openRuleForm(rule);
    component.submitRule();
    component.deleteRule(rule.id);
    component.openAssignmentForm();
    component.submitAssignment();
    component.removeAssignment('assignment-a');
    component.deleteRun(run.id);
    expect(component.showRuleForm || component.showAssignmentForm).toBeFalse();
    for (const method of [api.updateRule, api.deleteRule, api.createAssignment, api.removeAssignment, api.deleteValidationRun]) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it('preserves validation scope payload and renders only returned run results', async () => {
    permissions.add('governance.run');
    const { harness, element } = await render('/workbench/governance/validate?standardId=standard-a');
    const component = harness.routeDebugElement!.componentInstance as ValidationRunnerComponent;
    expect(component.form.value.standardId).toBe(standard.id);
    expect(api.runValidation).not.toHaveBeenCalled();
    component.form.patchValue({ scopeType: 'endpoint', scopeEndpointId: 'endpoint-a' });
    component.run();
    harness.detectChanges();
    expect(api.runValidation).toHaveBeenCalledWith({ standardId: standard.id, scopeEndpointId: 'endpoint-a' });
    expect(element.textContent).toContain('Completed');
    expect(element.querySelector('.result-stats')).toBeNull();
    component.viewReport();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('.gov-finding')).not.toBeNull();
  });

  it('refuses evaluation without its mutation permission', async () => {
    const { harness, element } = await render('/workbench/governance/validate');
    const component = harness.routeDebugElement!.componentInstance as ValidationRunnerComponent;
    component.form.patchValue({ standardId: standard.id });
    component.run();
    expect(api.runValidation).not.toHaveBeenCalled();
    expect(element.textContent).toContain('gov.evaluationUnavailable');
  });

  it('surfaces scope-load failures and unsuccessful validation responses', async () => {
    permissions.add('governance.run');
    api.getTeams.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    api.runValidation.and.returnValue(of({ success: false, message: 'Validation rejected' }));
    const { harness } = await render('/workbench/governance/validate');
    const component = harness.routeDebugElement!.componentInstance as ValidationRunnerComponent;
    expect(component.errorKey()).toBe('org.forbidden');
    component.form.patchValue({ standardId: standard.id });
    component.run();
    expect(component.errorMessage).toBe('Validation rejected');
    expect(component.result()).toBeNull();
  });

  it('renders findings with existing severity/path filters and expandable remediation', async () => {
    const { harness, element } = await render('/workbench/governance/runs/run-a/report');
    const component = harness.routeDebugElement!.componentInstance as ComplianceReportComponent;
    expect(element.querySelector('.stats-row, .stat-card')).toBeNull();
    component.toggleEndpoint('endpoint-a');
    harness.detectChanges();
    expect(element.textContent).toContain(rule.suggestedFix!);
    component.filterSeverity = 'Critical';
    harness.detectChanges();
    expect(element.textContent).toContain('gov.noMatches');
  });

  it('redacts endpoint paths, rule text and remediation in structural findings', async () => {
    structural.set(true);
    const { harness, element } = await render('/workbench/governance/runs/run-a/report');
    const component = harness.routeDebugElement!.componentInstance as ComplianceReportComponent;
    component.toggleEndpoint('endpoint-a');
    harness.detectChanges();
    expect(element.textContent).toContain('endpoint-a');
    expect(element.textContent).toContain(rule.id);
    for (const text of ['/private/path', standard.name, rule.ruleName, rule.errorMessage, rule.suggestedFix!]) {
      expect(element.textContent).not.toContain(text);
    }
  });

  it('preserves legacy detail and report routes', async () => {
    const { harness, element } = await render('/governance/standards/standard-a');
    expect(element.querySelector('.stats-row')).not.toBeNull();
    await harness.navigateByUrl('/governance/runs/run-a/report');
    expect(harness.routeNativeElement?.querySelector('.stats-row')).not.toBeNull();
  });

  it('cancels late catalogue reads on component destruction', async () => {
    const pending = new Subject<ApiResponse<PagedResult<ApiStandardDto>>>();
    api.getStandards.and.returnValue(pending);
    const { harness } = await render();
    const component = harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent;
    harness.fixture.destroy();
    pending.next({ success: true, data: paged([standard]) });
    expect(component.standards()).toEqual([]);
  });

  it('cancels obsolete detail reads when another standard is selected', async () => {
    const pending = new Subject<ApiResponse<ApiStandardDto>>();
    api.getStandard.and.callFake(id => id === standard.id ? pending
      : of({ success: true, data: { ...standard, id, name: 'Response standards' } }));
    const { harness, element } = await render();
    (element.querySelectorAll('.gov-resource')[1] as HTMLButtonElement).click();
    harness.detectChanges();
    pending.next({ success: true, data: standard });
    harness.detectChanges();
    expect(element.querySelector('.gov-context h2')?.textContent).toContain('Response standards');
  });

  it('preserves successful confirmed deletions for standards, rules, assignments and runs', async () => {
    permissions.add('governance.manage');
    spyOn(window, 'confirm').and.returnValue(true);
    const { harness } = await render();
    (harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent).delete(standard.id);
    expect(api.deleteStandard).toHaveBeenCalledWith(standard.id);
    await harness.navigateByUrl('/workbench/governance/standards/standard-a');
    const component = harness.routeDebugElement!.componentInstance as GovernanceDetailComponent;
    component.deleteRule(rule.id);
    component.removeAssignment('assignment-a');
    component.deleteRun(run.id);
    expect(api.deleteRule).toHaveBeenCalledWith(rule.id);
    expect(api.removeAssignment).toHaveBeenCalledWith('assignment-a');
    expect(api.deleteValidationRun).toHaveBeenCalledWith(run.id);
  });

  it('refreshes resource counts without destroying the current detail tab', async () => {
    permissions.add('governance.manage');
    const { harness, element } = await render();
    (element.querySelectorAll('.gov-tabs button')[1] as HTMLButtonElement).click();
    harness.detectChanges();
    const parent = harness.routeDebugElement!.componentInstance as GovernanceStandardsComponent;
    parent.refreshList();
    harness.detectChanges();
    expect(element.querySelector('.gov-tabs button[aria-pressed="true"]')?.textContent).toContain('gov.scope');
  });

  it('shows empty policies and evidence without inventing findings', async () => {
    api.getRules.and.returnValue(of({ success: true, data: [] }));
    api.getValidationRuns.and.returnValue(of({ success: true, data: paged([]) }));
    const { element } = await render();
    expect(element.textContent).toContain('gov.noRules');
    expect(element.textContent).toContain('gov.selectPolicy');
    expect(element.querySelector('.gov-evidence')?.textContent).toContain('gov.noRuns');
    expect(element.textContent).toContain('gov.evaluationUnavailable');
  });

  it('renders report loading and explicit forbidden states without fabricated results', async () => {
    const pending = new Subject<ApiResponse<ComplianceReportDto>>();
    api.getComplianceReport.and.returnValue(pending);
    const { harness, element } = await render('/workbench/governance/runs/run-a/report');
    expect(element.querySelector('app-loading')).not.toBeNull();
    pending.error(new HttpErrorResponse({ status: 403 }));
    harness.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('org.forbidden');
    expect(element.querySelector('.gov-finding')).toBeNull();
  });
});
