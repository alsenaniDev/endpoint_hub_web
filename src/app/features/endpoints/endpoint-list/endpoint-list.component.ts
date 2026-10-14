import { Component, Input, OnInit, DestroyRef, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { Router } from '@angular/router';
import { MultiSelectModule } from 'primeng/multiselect';
import { DropdownModule } from 'primeng/dropdown';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ExportDocService } from '../../../core/services/export-doc.service';
import { TranslateService } from '../../../core/services/translate.service';
import { EndpointListItem, EnvironmentDto, HttpMethodType, ChangeStatus, Team, SwaggerSourceDto } from '../../../core/models/models';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { MethodBadgeComponent } from '../../../shared/components/method-badge/method-badge.component';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { apiErrorKey } from '../../../core/models/organization';
import { EndpointDetailComponent } from '../endpoint-detail/endpoint-detail.component';
import { EndpointRunnerComponent } from '../endpoint-runner/endpoint-runner.component';

const CHANGE_STATUS_COLORS: Record<string, string> = {
  New: 'var(--green)', Modified: 'var(--yellow)', Deleted: 'var(--red)', Unchanged: 'var(--text-subtle)'
};

interface TagGroup { tag: string; endpoints: EndpointListItem[]; favoriteCount: number; newSharingCount: number; newCount: number; modifiedCount: number; deletedCount: number; }
interface EnvGroup { envId: string; envName: string; tagGroups: TagGroup[]; totalEndpoints: number; favoriteCount: number; newSharingCount: number; newCount: number; modifiedCount: number; deletedCount: number; }
interface SystemGroup { systemId: string; systemName: string; envGroups: EnvGroup[]; totalEndpoints: number; envCount: number; favoriteCount: number; newSharingCount: number; newCount: number; modifiedCount: number; deletedCount: number; }

@Component({
  selector: 'app-endpoint-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, MultiSelectModule, DropdownModule, LoadingComponent, MethodBadgeComponent, TranslatePipe, PermissionDirective, EndpointDetailComponent, EndpointRunnerComponent],
  templateUrl: './endpoint-list.component.html',
  styleUrls: ['./endpoint-list.component.scss', './endpoint-workspace.scss']
})

export class EndpointListComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private exportDoc = inject(ExportDocService);
  private ts = inject(TranslateService);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly isWorkbench = this.router.url.startsWith('/workbench');
  @Input() documentationOnly = false;
  @Input() showDocumentationExplorer = false;
  @Input() scopeEnvironmentId = '';
  @Input() scopeSourceId = '';
  readonly canRun = computed(() => !this.documentationOnly && !this.structuralOnly() && this.auth.hasPermission('endpoints.run'));
  readonly canExport = computed(() => !this.structuralOnly() && this.auth.hasPermission('export.view'));
  readonly showFilters = signal(false);
  readonly toggleBoolean = (value: boolean): boolean => !value;
  readonly activeEndpointId = signal<string | null>(null);
  readonly workspaceTab = signal<'details' | 'request'>('details');
  readonly activeEndpoint = computed<EndpointListItem | null>(() => {
    const visible = this.systemGroups().flatMap(system =>
      system.envGroups.flatMap(environment => environment.tagGroups.flatMap(group => group.endpoints)));
    return visible.find(endpoint => endpoint.id === this.activeEndpointId()) ?? visible[0] ?? null;
  });
  // Key the existing feature components by endpoint ID so request/response state never leaks between selections.
  readonly workspaceEndpoints = computed(() => {
    const endpoint = this.activeEndpoint();
    return endpoint ? [endpoint] : [];
  });

  selectEndpoint(endpoint: EndpointListItem): void {
    this.activeEndpointId.set(endpoint.id);
  }

  trackEndpoint(_index: number, endpoint: EndpointListItem): string { return endpoint.id; }

  runRoute(endpointId: string): string[] { return ['/workbench/endpoints', endpointId, 'run']; }

  copiedId = signal<string | null>(null);
  favoritesOnly = signal(false);
  sharedWithMeOnly = signal(false);
  newSharingOnly = signal(false);

  private organization = inject(OrganizationContextService);
  readonly structuralOnly = this.organization.structuralOnly;
  readonly canMutate = this.organization.canMutate;
  errorKey = signal<string | null>(null);
  private fail(error?: { status?: number }): void {
    this.errorKey.set(apiErrorKey(error?.status ?? 500));
    this.loading.set(false);
  }
  canSelectTeams = computed(() => this.auth.hasPermission('teams.view'));
  hasMembershipTeam = computed(() => !!this.organization.membership()?.teamId);

  // Share panel state
  showSharePanel = signal(false);
  /** 'user' | 'my-team' | 'teams' */
  shareMode = signal<'user' | 'my-team' | 'teams'>('user');
  shareTarget = '';          // for 'user' mode
  shareTeamIds: string[] = [];  // for 'teams' mode (multi-select)
  shareTeams = signal<Team[]>([]);
  sharing = signal(false);
  shareResult = signal<{ ok: boolean; msg: string } | null>(null);
  /** IDs to share: empty = share all favorites, one = single endpoint, many = selection */
  shareEndpointIds = signal<string[]>([]);
  shareEndpointLabel = signal<string>('');

  // Multi-select mode
  selectionMode = signal(false);
  selectedEpIds = signal<Set<string>>(new Set());
  selectedCount = computed(() => this.selectedEpIds().size);

  endpoints = signal<EndpointListItem[]>([]);
  environments = signal<EnvironmentDto[]>([]);
  swaggerSources = signal<SwaggerSourceDto[]>([]);
  tags = signal<string[]>([]);
  loading = signal(true);
  total = signal(0);
  hasMore = signal(false);
  private pageSize = 500;
  private loadedCount = 0;

  methods: HttpMethodType[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  private filters: Record<string, any> = {};
  private expandedSystems = new Set<string>();
  private expandedTags = new Set<string>();

  // Dropdown selected values
  selectedSystemId = signal<string | null>(null);
  selectedEnvId: string | null = null;
  selectedSourceId: string | null = null;
  selectedMethod: string | null = null;
  selectedTag: string | null = null;
  selectedChangeStatus: string | null = null;

  // Dropdown option lists
  systemOptions = computed(() => {
    const seen = new Map<string, string>(); // systemId → systemName
    for (const env of this.environments()) {
      if (!seen.has(env.systemId)) seen.set(env.systemId, env.systemName);
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ label: this.structuralOnly() ? `${label} · ${value}` : label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  envOptions = computed(() => {
    const sysId = this.selectedSystemId();
    if (sysId) {
      // Flat list — only this system’s environments, no grouping needed
      return this.environments()
        .filter(e => e.systemId === sysId)
        .map(e => ({ label: this.structuralOnly() ? `${e.name} · ${e.id}` : e.name, value: e.id }));
    }
    // Grouped by system (shown in search-across-all mode)
    const systemMap = new Map<string, { label: string; items: { label: string; value: string; searchText: string }[] }>();
    for (const env of this.environments()) {
      if (!systemMap.has(env.systemId))
        systemMap.set(env.systemId, { label: this.structuralOnly() ? `${env.systemName} · ${env.systemId}` : env.systemName, items: [] });
      systemMap.get(env.systemId)!.items.push({
        label: this.structuralOnly() ? `${env.name} · ${env.id}` : env.name,
        value: env.id,
        searchText: `${env.systemName} ${env.name}`
      });
    }
    return [...systemMap.values()];
  });

  sourceOptions = computed(() => this.swaggerSources().map(s => ({ label: this.structuralOnly() ? `${s.label} · ${s.id}` : s.label, value: s.id })));
  tagOptions = computed(() => this.tags().map(t => ({ label: t, value: t })));
  methodOptions = this.methods.map(m => ({ label: m, value: m }));
  changeOptions: { label: string; value: string }[] = [];

  private tagKey(systemId: string, envId: string, tag: string): string { return `${systemId}|${envId}|${tag}`; }

  detailRoute(endpointId: string): string[] {
    return this.isWorkbench
      ? ['/workbench/endpoints', endpointId]
      : ['/endpoints', endpointId];
  }

  // Unique endpoints: same path+method within a system counts once regardless of how many environments it appears in
  uniqueEndpointCount = computed(() => {
    const seen = new Set<string>();
    for (const ep of this.endpoints()) seen.add(this.structuralOnly() ? ep.id : `${ep.systemId}|${ep.method}|${ep.path}`);
    return seen.size;
  });

  systemGroups = computed<SystemGroup[]>(() => {
    const sysMap = new Map<string, { systemName: string; envMap: Map<string, { envName: string; tagMap: Map<string, EndpointListItem[]> }> }>();
    const source = this.newSharingOnly() ? this.endpoints().filter(ep => ep.isNew) : this.endpoints();
    for (const ep of source) {
      if (!sysMap.has(ep.systemId))
        sysMap.set(ep.systemId, { systemName: ep.systemName, envMap: new Map() });
      const sysEntry = sysMap.get(ep.systemId)!;
      if (!sysEntry.envMap.has(ep.environmentId))
        sysEntry.envMap.set(ep.environmentId, { envName: ep.environmentName, tagMap: new Map() });
      const envEntry = sysEntry.envMap.get(ep.environmentId)!;
      const tag = ep.tag?.trim() || 'General';
      if (!envEntry.tagMap.has(tag)) envEntry.tagMap.set(tag, []);
      envEntry.tagMap.get(tag)!.push(ep);
    }
    return Array.from(sysMap.entries()).map(([systemId, { systemName, envMap }]) => {
      const envGroups: EnvGroup[] = Array.from(envMap.entries())
        .map(([envId, { envName, tagMap }]) => {
          const tagGroups: TagGroup[] = Array.from(tagMap.entries())
            .map(([tag, endpoints]) => {
              const sorted = [...endpoints].sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
              return {
                tag, endpoints: sorted,
                favoriteCount: endpoints.filter(e => e.isFavorite).length,
                newSharingCount: endpoints.filter(e => e.isNew).length,
                newCount: endpoints.filter(e => e.changeStatus === 'New').length,
                modifiedCount: endpoints.filter(e => e.changeStatus === 'Modified').length,
                deletedCount: endpoints.filter(e => e.changeStatus === 'Deleted').length,
              };
            })
            .sort((a, b) => a.tag.localeCompare(b.tag));
          const allEp = tagGroups.flatMap(g => g.endpoints);
          return {
            envId, envName, tagGroups,
            totalEndpoints: allEp.length,
            favoriteCount: allEp.filter(e => e.isFavorite).length,
            newSharingCount: allEp.filter(e => e.isNew).length,
            newCount: allEp.filter(e => e.changeStatus === 'New').length,
            modifiedCount: allEp.filter(e => e.changeStatus === 'Modified').length,
            deletedCount: allEp.filter(e => e.changeStatus === 'Deleted').length,
          };
        })
        .sort((a, b) => a.envName.localeCompare(b.envName));
      const allEndpoints = envGroups.flatMap(eg => eg.tagGroups.flatMap(t => t.endpoints));
      return {
        systemId, systemName, envGroups,
        totalEndpoints: allEndpoints.length,
        envCount: envGroups.length,
        favoriteCount: allEndpoints.filter(e => e.isFavorite).length,
        newSharingCount: allEndpoints.filter(e => e.isNew).length,
        newCount: allEndpoints.filter(e => e.changeStatus === 'New').length,
        modifiedCount: allEndpoints.filter(e => e.changeStatus === 'Modified').length,
        deletedCount: allEndpoints.filter(e => e.changeStatus === 'Deleted').length,
      };
    });
  });

  ngOnInit(): void {
    if (this.documentationOnly) {
      this.filters['environmentId'] = this.scopeEnvironmentId;
      this.filters['swaggerSourceId'] = this.scopeSourceId || undefined;
    }
    if (this.isWorkbench && this.canRun()) this.workspaceTab.set('request');
    // Rebuild change-status options whenever translations load (async) or language switches
    this.ts.translations$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(t => {
      this.changeOptions = [
        { label: t['common.new'] ?? 'New', value: '1' },
        { label: t['common.modified'] ?? 'Modified', value: '3' },
        { label: t['common.deleted'] ?? 'Deleted', value: '2' },
      ];
    });
    if (!this.documentationOnly) this.api.getEnvironments().subscribe({
      next: res => { if (res.success) this.environments.set(res.data?.items ?? []); else this.fail(); },
      error: error => this.fail(error)
    });
    // Activate Shared with Me view when navigated from a share notification
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('sharedWithMe') === '1') {
      this.sharedWithMeOnly.set(true);
    }
    this.loadEndpoints();
  }

  loadEndpoints(): void {
    this.loading.set(true);
    this.errorKey.set(null);
    if (this.structuralOnly()) {
      delete this.filters['search'];
      delete this.filters['tag'];
    }
    this.loadedCount = 0;
    this.api.getEndpoints({ ...this.filters, favoritesOnly: this.favoritesOnly(), sharedWithMeOnly: this.sharedWithMeOnly(), page: 1, pageSize: this.pageSize }).subscribe({
      next: res => {
        if (res.success && res.data) {
          this.endpoints.set(res.data.items);
          if (this.isWorkbench && !this.activeEndpointId() && res.data.items.length) {
            this.activeEndpointId.set(res.data.items[0].id);
            this.expandAll();
          }
          this.total.set(res.data.totalCount);
          this.loadedCount = res.data.items.length;
          this.hasMore.set(res.data.totalCount > this.loadedCount);
        } else this.fail();
        this.loading.set(false);
      },
      error: error => this.fail(error)
    });
  }

  loadMore(): void {
    const nextPage = Math.floor(this.loadedCount / this.pageSize) + 1;
    this.loading.set(true);
    this.api.getEndpoints({ ...this.filters, favoritesOnly: this.favoritesOnly(), sharedWithMeOnly: this.sharedWithMeOnly(), page: nextPage, pageSize: this.pageSize }).subscribe({
      next: res => {
        if (res.success && res.data) {
          this.endpoints.update(list => [...list, ...res.data!.items]);
          this.loadedCount += res.data.items.length;
          this.hasMore.set(res.data.totalCount > this.loadedCount);
        } else this.fail();
        this.loading.set(false);
      },
      error: error => this.fail(error)
    });
  }

  isExpanded(systemId: string): boolean { return this.expandedSystems.has(systemId); }
  toggleSystem(systemId: string): void {
    if (this.expandedSystems.has(systemId)) this.expandedSystems.delete(systemId);
    else this.expandedSystems.add(systemId);
  }
  isTagExpanded(systemId: string, envId: string, tag: string): boolean { return this.expandedTags.has(this.tagKey(systemId, envId, tag)); }
  toggleTag(systemId: string, envId: string, tag: string): void {
    const k = this.tagKey(systemId, envId, tag);
    if (this.expandedTags.has(k)) this.expandedTags.delete(k);
    else this.expandedTags.add(k);
  }
  expandAll(): void {
    this.systemGroups().forEach(g => {
      this.expandedSystems.add(g.systemId);
      g.envGroups.forEach(eg => eg.tagGroups.forEach(t => this.expandedTags.add(this.tagKey(g.systemId, eg.envId, t.tag))));
    });
  }
  collapseAll(): void { this.expandedSystems.clear(); this.expandedTags.clear(); }

  onSystemChanged(val: string | null): void {
    this.selectedSystemId.set(val);
    this.filters['systemId'] = val || undefined;
    // Clear dependent filters
    this.selectedEnvId = null;
    this.selectedSourceId = null;
    this.selectedTag = null;
    this.filters['environmentId'] = undefined;
    this.filters['swaggerSourceId'] = undefined;
    this.filters['tag'] = undefined;
    this.swaggerSources.set([]);
    this.tags.set([]);
    this.loadEndpoints();
  }

  onEnvChanged(val: string | null): void {
    this.filters['environmentId'] = val || undefined;
    this.filters['swaggerSourceId'] = undefined;
    this.selectedSourceId = null;
    this.swaggerSources.set([]);
    if (val) {
      if (!this.structuralOnly()) this.api.getEndpointTags(val).subscribe({
        next: r => { if (r.success) this.tags.set(r.data ?? []); else this.fail(); },
        error: error => this.fail(error)
      });
      this.api.getSwaggerSources(val).subscribe({
        next: r => { if (r.success) this.swaggerSources.set(r.data ?? []); else this.fail(); },
        error: error => this.fail(error)
      });
    } else {
      this.tags.set([]);
      this.selectedTag = null;
      this.filters['tag'] = undefined;
    }
    this.loadEndpoints();
  }
  onSourceChanged(val: string | null): void { this.filters['swaggerSourceId'] = val || undefined; this.loadEndpoints(); }
  onMethodChanged(val: string | null): void { this.filters['method'] = val || undefined; this.loadEndpoints(); }
  onTagChanged(val: string | null): void { if (this.structuralOnly()) return; this.filters['tag'] = val || undefined; this.loadEndpoints(); }
  onChangeStatusChanged(val: string | null): void { this.filters['changeStatus'] = val || undefined; this.loadEndpoints(); }
  onSearch(e: Event): void { if (this.structuralOnly()) return; this.filters['search'] = (e.target as HTMLInputElement).value || undefined; this.loadEndpoints(); }
  getChangeColor(status: ChangeStatus): string { return CHANGE_STATUS_COLORS[status] ?? 'var(--text-subtle)'; }

  toggleFavoritesFilter(): void {
    this.sharedWithMeOnly.set(false);
    this.favoritesOnly.update(v => !v);
    this.loadEndpoints();
  }

  toggleSharedFilter(): void {
    this.favoritesOnly.set(false);
    this.sharedWithMeOnly.update(v => !v);
    if (!this.sharedWithMeOnly()) this.newSharingOnly.set(false);
    this.loadEndpoints();
  }

  toggleNewSharingFilter(): void {
    this.newSharingOnly.update(v => !v);
  }

  onToggleFavorite(ep: EndpointListItem): void {
    if (!this.canMutate()) return;
    this.api.toggleFavorite(ep.id).subscribe({ next: res => {
      if (res.success) {
        this.endpoints.update(list =>
          list.map(e => e.id === ep.id ? { ...e, isFavorite: res.data! } : e)
        );
        // If in favorites-only mode and user un-favorites, remove from list
        if (this.favoritesOnly() && !res.data) {
          this.endpoints.update(list => list.filter(e => e.id !== ep.id));
          this.total.update(n => n - 1);
        }
        // If in shared-with-me mode and user starred (converting to own-fav), remove from list
        if (this.sharedWithMeOnly() && res.data) {
          this.endpoints.update(list => list.filter(e => e.id !== ep.id));
          this.total.update(n => n - 1);
        }
      } else this.fail();
    }, error: error => this.fail(error) });
  }

  doShare(): void {
    if (!this.canMutate()) return;
    this.sharing.set(true);
    this.shareResult.set(null);

    const mode = this.shareMode();
    const epIds = this.shareEndpointIds();
    let payload: import('../../../core/models/models').ShareFavoritesRequest;

    if (mode === 'user') {
      const target = this.shareTarget.trim();
      if (!target) { this.sharing.set(false); return; }
      payload = { targetUser: target, endpointIds: epIds.length > 0 ? epIds : undefined };
    } else if (mode === 'my-team') {
      payload = { shareWithMyTeam: true, endpointIds: epIds.length > 0 ? epIds : undefined };
    } else {
      // 'teams'
      if (!this.shareTeamIds.length) { this.sharing.set(false); return; }
      payload = { teamIds: this.shareTeamIds, endpointIds: epIds.length > 0 ? epIds : undefined };
    }

    this.api.shareFavorites(payload).subscribe({
      next: res => {
        this.sharing.set(false);
        if (!res.success) this.fail();
        this.shareResult.set({ ok: res.success, msg: res.message ?? (res.success ? 'Shared!' : 'Failed.') });
        if (res.success) {
          this.shareTarget = ''; this.shareTeamIds = [];
          if (this.selectionMode()) { this.selectedEpIds.set(new Set()); this.selectionMode.set(false); }
        }
      },
      error: error => {
        this.sharing.set(false);
        this.fail(error);
      }
    });
  }

  openSharePanel(): void {
    if (!this.canMutate()) return;
    this.shareEndpointIds.set([]);
    this.shareEndpointLabel.set('');
    this.showSharePanel.set(true);
    this.shareMode.set('user');
    this.shareResult.set(null);
    this.shareTarget = '';
    this.shareTeamIds = [];
    // Load teams for SuperAdmin if not loaded yet
    if (this.canSelectTeams() && !this.shareTeams().length) {
      this.loadShareTeams();
    }
  }

  openSharePanelForEndpoint(ep: EndpointListItem): void {
    if (!this.canMutate()) return;
    this.shareEndpointIds.set([ep.id]);
    this.shareEndpointLabel.set(`${ep.method} ${ep.path}`);
    this.showSharePanel.set(true);
    this.shareMode.set('user');
    this.shareResult.set(null);
    this.shareTarget = '';
    this.shareTeamIds = [];
    if (this.canSelectTeams() && !this.shareTeams().length) {
      this.loadShareTeams();
    }
  }

  openSharePanelForSelected(): void {
    if (!this.canMutate()) return;
    const ids = [...this.selectedEpIds()];
    this.shareEndpointIds.set(ids);
    this.shareEndpointLabel.set(`${ids.length} endpoint${ids.length !== 1 ? 's' : ''} selected`);
    this.showSharePanel.set(true);
    this.shareMode.set('user');
    this.shareResult.set(null);
    this.shareTarget = '';
    this.shareTeamIds = [];
    if (this.canSelectTeams() && !this.shareTeams().length) {
      this.loadShareTeams();
    }
  }

  toggleSelectionMode(): void {
    if (!this.canMutate()) return;
    this.selectionMode.update(v => !v);
    if (!this.selectionMode()) this.selectedEpIds.set(new Set());
  }

  private loadShareTeams(): void {
    this.api.getTeams(undefined, 1, 200).subscribe({
      next: res => { if (res.success) this.shareTeams.set(res.data?.items ?? []); else this.fail(); },
      error: error => this.fail(error)
    });
  }

  toggleSelection(ep: EndpointListItem, event: Event): void {
    if (!this.canMutate()) return;
    event.preventDefault();
    event.stopPropagation();
    this.selectedEpIds.update(s => {
      const next = new Set(s);
      if (next.has(ep.id)) next.delete(ep.id); else next.add(ep.id);
      return next;
    });
  }

  isSelected(id: string): boolean { return this.selectedEpIds().has(id); }

  removeShared(ep: EndpointListItem): void {
    if (!this.canMutate()) return;
    this.api.removeShared(ep.id).subscribe({ next: res => {
      if (res.success) {
        this.endpoints.update(list => list.filter(e => e.id !== ep.id));
        this.total.update(n => n - 1);
      } else this.fail();
    }, error: error => this.fail(error) });
  }

  // ── Export ────────────────────────────────────────────────────────────────
  exportAll(): void {
    if (this.structuralOnly() || !this.auth.hasPermission('export.view')) return;
    const label = this.filters['systemId']
      ? (this.systemGroups()[0]?.systemName ?? 'Endpoints')
      : 'All Endpoints';
    this.exportDoc.export({ type: 'system', label, ...this.filters });
  }

  exportSystem(group: SystemGroup): void {
    if (this.structuralOnly() || !this.auth.hasPermission('export.view')) return;
    this.exportDoc.export({ type: 'system', label: group.systemName, systemId: group.systemId });
  }

  exportTag(group: SystemGroup, eg: EnvGroup, tg: TagGroup): void {
    if (this.structuralOnly() || !this.auth.hasPermission('export.view')) return;
    this.exportDoc.export({ type: 'tag', label: `${group.systemName} — ${tg.tag} (${eg.envName})`, systemId: group.systemId, tag: tg.tag, environmentId: eg.envId });
  }

  exportEndpoint(ep: EndpointListItem): void {
    if (this.structuralOnly() || !this.auth.hasPermission('export.view')) return;
    this.exportDoc.export({ type: 'endpoints', label: `${ep.method} ${ep.path}`, endpointIds: [ep.id] });
  }

  copyEndpoint(ep: EndpointListItem): void {
    if (this.structuralOnly()) return;
    this.api.getEndpoint(ep.id).subscribe({ next: res => {
      if (this.structuralOnly()) return;
      if (!res.success || !res.data) { this.fail(); return; }
      const d = res.data;
      const baseUrl = (d.baseUrl ?? '').replace(/\/$/, '');
      const url = `${baseUrl}${d.path}`;

      const lines: string[] = [
        `${d.method} ${url}`,
        d.summary ? `Summary: ${d.summary}` : '',
        d.description ? `Description: ${d.description}` : '',
        '',
      ];

      const queryParams = d.parameters.filter(p => p.location === 'Query');
      const pathParams = d.parameters.filter(p => p.location === 'Path');
      const headerParams = d.parameters.filter(p => p.location === 'Header');

      if (pathParams.length) {
        lines.push('Path Parameters:');
        pathParams.forEach(p => lines.push(`  ${p.name}${p.required ? ' (required)' : ''}: ${this.paramTypeLine(p.schema)} ${p.description ? '— ' + p.description : ''}`));
        lines.push('');
      }
      if (queryParams.length) {
        lines.push('Query Parameters:');
        queryParams.forEach(p => lines.push(`  ${p.name}${p.required ? ' (required)' : ''}: ${this.paramTypeLine(p.schema)} ${p.description ? '— ' + p.description : ''}`));
        lines.push('');
      }
      if (headerParams.length) {
        lines.push('Request Headers:');
        headerParams.forEach(p => lines.push(`  ${p.name}${p.required ? ' (required)' : ''} ${p.description ? '— ' + p.description : ''}`));
        lines.push('');
      }

      if (d.requestBodies.length) {
        const rb = d.requestBodies[0];
        lines.push(`Request Body (${rb.contentType}):`);
        if (rb.example) {
          try { lines.push(JSON.stringify(JSON.parse(rb.example), null, 2)); } catch { lines.push(rb.example); }
        } else if (rb.schema) {
          try { lines.push(JSON.stringify(JSON.parse(rb.schema), null, 2)); } catch { lines.push(rb.schema); }
        }
        lines.push('');
      }

      if (d.responses.length) {
        lines.push('Responses:');
        d.responses.forEach(r => {
          lines.push(`  ${r.statusCode}${r.description ? ' — ' + r.description : ''}`);
          if (r.example) {
            try { lines.push(JSON.stringify(JSON.parse(r.example), null, 2).split('\n').map(l => '    ' + l).join('\n')); } catch { lines.push('    ' + r.example); }
          } else if (r.schema) {
            try { lines.push(JSON.stringify(JSON.parse(r.schema), null, 2).split('\n').map(l => '    ' + l).join('\n')); } catch { lines.push('    ' + r.schema); }
          }
        });
      }

      navigator.clipboard.writeText(lines.filter(l => l !== undefined).join('\n')).then(() => {
        this.copiedId.set(ep.id);
        setTimeout(() => this.copiedId.set(null), 2000);
      }).catch(() => this.fail());
    }, error: error => this.fail(error) });
  }

  private paramTypeLine(schema?: string): string {
    if (!schema) return '';
    try {
      const s = JSON.parse(schema);
      let t = s.type ?? '';
      if (s.format) t += `(${s.format})`;
      if (s.enum) t += ` [${s.enum.join('|')}]`;
      return t;
    } catch { return ''; }
  }
}
