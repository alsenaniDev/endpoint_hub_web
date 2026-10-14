import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import {
  ComplianceReportDto, EndpointComplianceSummaryDto,
  ValidationResultDto, ValidationSeverity, ValidationStatus
} from '../../../core/models/models';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { apiErrorKey } from '../../../core/models/organization';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';

@Component({
  selector: 'app-compliance-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LoadingComponent, TranslatePipe],
  templateUrl: './compliance-report.component.html',
  styleUrls: ['./compliance-report.component.scss', '../governance-workspace.scss']
})
export class ComplianceReportComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  readonly organization = inject(OrganizationContextService);
  readonly structuralOnly = this.organization.structuralOnly;
  readonly workbench = inject(Router).url.startsWith('/workbench');
  readonly baseRoute = this.workbench ? '/workbench/governance' : '/governance';
  errorKey = signal<string | null>(null);

  runId = '';
  report = signal<ComplianceReportDto | null>(null);
  loading = signal(true);
  expandedEndpoints = new Set<string>();
  filterSeverity: ValidationSeverity | '' = '';
  searchPath = '';

  ngOnInit(): void {
    this.runId = this.route.snapshot.paramMap.get('runId') ?? '';
    this.api.getComplianceReport(this.runId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => { if (res.success && res.data) this.report.set(res.data); else this.errorKey.set(apiErrorKey(500)); this.loading.set(false); },
      error: error => { this.errorKey.set(apiErrorKey(error.status ?? 500)); this.loading.set(false); }
    });
  }

  get filteredSummaries(): EndpointComplianceSummaryDto[] {
    let items = this.report()?.endpointSummaries ?? [];
    if (!this.structuralOnly() && this.searchPath) items = items.filter(e => e.path.toLowerCase().includes(this.searchPath.toLowerCase()));
    if (this.filterSeverity) items = items.filter(e => e.violations.some(v => v.severity === this.filterSeverity));
    return items;
  }

  toggleEndpoint(id: string): void {
    if (this.expandedEndpoints.has(id)) this.expandedEndpoints.delete(id);
    else this.expandedEndpoints.add(id);
  }

  isExpanded(id: string): boolean { return this.expandedEndpoints.has(id); }

  scoreClass(score: number): string {
    if (score >= 80) return 'score-high';
    if (score >= 50) return 'score-mid';
    return 'score-low';
  }

  severityClass(s: ValidationSeverity): string {
    return { Info: 'badge-info', Warning: 'badge-warning', Error: 'badge-error', Critical: 'badge-critical' }[s] ?? '';
  }

  statusIcon(s: ValidationStatus): string {
    return { Passed: '✓', Failed: '✗', Skipped: '–' }[s] ?? '';
  }

  readonly severities: ValidationSeverity[] = ['Info', 'Warning', 'Error', 'Critical'];
}
