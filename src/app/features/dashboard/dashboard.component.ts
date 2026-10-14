import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { catchError, EMPTY, startWith, Subscription, switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { DashboardStats, EnvironmentEndpointsStatsDto } from '../../core/models/models';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { apiErrorKey } from '../../core/models/organization';

export interface SystemGroup {
  systemId: string;
  systemName: string;
  totalEndpoints: number;
  envCount: number;
  environments: EnvironmentEndpointsStatsDto[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingComponent, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private organization = inject(OrganizationContextService);
  private readonly router = inject(Router);
  readonly structuralOnly = this.organization.structuralOnly;
  readonly workbench = this.router.url.startsWith('/workbench');
  readonly canAddEnvironment = computed(() => this.organization.canMutate() &&
    this.organization.hasPermission('environments.manage'));
  private subscription: Subscription | null = null;
  errorKey = signal<string | null>(null);
  stats = signal<DashboardStats | null>(null);
  loading = signal(true);
  readonly contractError = computed(() => this.structuralOnly() &&
    (this.stats()?.endpointsByEnvironment ?? []).some(env => typeof env.systemId !== 'string' || !env.systemId.trim()));

  expandedSystems = signal<Set<string>>(new Set());
  expandedSyncs = signal<Set<number>>(new Set());

  groupedBySystem = computed<SystemGroup[]>(() => {
    if (this.contractError()) return [];
    const envs = this.stats()?.endpointsByEnvironment ?? [];
    const map = new Map<string, SystemGroup>();
    for (const env of envs) {
      // Legacy nonViewer responses can preserve their previous display grouping.
      const systemId = env.systemId || env.systemName;
      if (!map.has(systemId)) {
        map.set(systemId, { systemId, systemName: env.systemName, totalEndpoints: 0, envCount: 0, environments: [] });
      }
      const group = map.get(systemId)!;
      group.totalEndpoints += env.totalEndpoints;
      group.envCount++;
      group.environments.push(env);
    }
    return [...map.values()].sort((a, b) => a.systemName.localeCompare(b.systemName));
  });

  recentSyncs = computed(() =>
    [...(this.stats()?.recentSyncs ?? [])]
  );

  readonly latestSyncs = computed(() => this.recentSyncs().slice(0, 5));
  readonly overviewOrganizationName = computed(() => this.structuralOnly()
    ? null : this.organization.activeOrganization()?.name ?? null);
  readonly allResourceCountsAreZero = computed(() => {
    const stats = this.stats();
    return !!stats && stats.totalTeams === 0 && stats.totalSystems === 0 &&
      stats.totalEnvironments === 0 && stats.totalEndpoints === 0;
  });
  readonly canOpenTeams = computed(() => this.organization.hasPermission('teams.view'));
  readonly canOpenSystems = computed(() => this.organization.hasPermission('systems.view'));
  readonly canOpenEnvironments = computed(() => this.organization.hasPermission('environments.view'));
  readonly canOpenEndpoints = computed(() => this.organization.hasPermission('endpoints.view'));
  readonly canOpenSwagger = computed(() => this.organization.hasPermission('swaggersync.view'));
  readonly canOpenGovernance = computed(() => this.organization.hasPermission('governance.view'));

  environmentRoute(): string {
    return this.workbench ? '/workbench/environments' : '/environments';
  }

  toggleSystem(name: string): void {
    this.expandedSystems.update(set => {
      const next = new Set(set);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  isSystemExpanded(name: string): boolean {
    return this.expandedSystems().has(name);
  }

  toggleSync(idx: number): void {
    this.expandedSyncs.update(set => {
      const next = new Set(set);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  isSyncExpanded(idx: number): boolean {
    return this.expandedSyncs().has(idx);
  }

  ngOnInit(): void {
    this.subscription = this.organization.changes$.pipe(
      startWith(undefined),
      switchMap(() => {
        this.stats.set(null);
        this.errorKey.set(null);
        this.expandedSystems.set(new Set());
        this.expandedSyncs.set(new Set());
        if (!this.organization.ready()) {
          this.loading.set(false);
          return EMPTY;
        }
        this.loading.set(true);
        return this.api.getDashboardStats().pipe(
          catchError(error => {
            this.errorKey.set(apiErrorKey(error.status ?? 500));
            this.loading.set(false);
            return EMPTY;
          })
        );
      })
    ).subscribe(res => {
      if (res.success && res.data) this.stats.set(res.data);
      else this.errorKey.set(apiErrorKey(500));
      this.loading.set(false);
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  toggleSyncAt(index: number): void {
    this.toggleSync(index);
  }
}
