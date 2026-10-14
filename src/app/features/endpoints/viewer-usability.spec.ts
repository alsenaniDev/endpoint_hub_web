import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { EndpointListComponent } from './endpoint-list/endpoint-list.component';
import { EndpointDetailComponent } from './endpoint-detail/endpoint-detail.component';
import { ChangeHistoryComponent } from './change-history/change-history.component';
import { CodeGeneratorComponent } from './code-generator/code-generator.component';
import { GovernanceDetailComponent } from '../governance/governance-detail/governance-detail.component';
import { ComplianceReportComponent } from '../governance/compliance-report/compliance-report.component';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { NotificationBellComponent } from '../../shared/components/notification-bell/notification-bell.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ExportDocService } from '../../core/services/export-doc.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { OrganizationRealtimeService } from '../../core/services/organization-realtime.service';
import { NotificationService } from '../../core/services/notification.service';
import { TranslateService } from '../../core/services/translate.service';
import { EndpointListItem, EndpointDetail, AppNotification } from '../../core/models/models';

describe('Viewer usability on real feature components', () => {
  const ep = {
    id: 'endpoint-a', systemId: 'system-a', systemName: '[restricted]',
    environmentId: 'env-a', environmentName: '[restricted]', method: 'GET',
    path: '[restricted]', summary: '[restricted]', tag: '[restricted]',
    changeStatus: 'Unchanged', isFavorite: false, isShared: true, isNew: true,
    parameters: [], headers: [], requestBodies: [], responses: [], securityRequirements: []
  } as unknown as EndpointDetail & EndpointListItem;
  const notice: AppNotification = {
    id: 'notification-a', message: '[restricted]', type: 'share', isRead: false,
    createdAt: '2026-10-03T00:00:00Z', relatedEntityId: null
  };
  const forbidden = () => throwError(() => new HttpErrorResponse({ status: 403 }));
  let viewer: ReturnType<typeof signal<boolean>>;
  let ready: ReturnType<typeof signal<boolean>>;
  let manage: ReturnType<typeof signal<boolean>>;
  let api: jasmine.SpyObj<ApiService>;
  let notifications: jasmine.SpyObj<NotificationService>;
  let context: { structuralOnly: ReturnType<typeof computed<boolean>>; canMutate: ReturnType<typeof computed<boolean>>; hasPermission: (key: string) => boolean };

  beforeEach(async () => {
    viewer = signal(true); ready = signal(true); manage = signal(true);
    context = {
      structuralOnly: computed(() => !ready() || viewer()),
      canMutate: computed(() => ready() && !viewer()),
      hasPermission: key => ready() && (key.endsWith('.view') || manage())
    };
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getEnvironments', 'getEndpoints', 'getEndpoint', 'getEndpointTags', 'getSwaggerSources',
      'toggleFavorite', 'shareFavorites', 'removeShared', 'getTeams', 'updateEndpointNotes',
      'getChangeHistory', 'generateTypeScript', 'getDashboardStats', 'getStandard', 'getRules',
      'getAssignments', 'getValidationRuns', 'getSystems', 'deleteValidationRun',
      'createRule', 'updateRule', 'deleteRule', 'createAssignment', 'removeAssignment', 'getComplianceReport'
    ]);
    for (const method of Object.keys(api)) {
      (api as any)[method].and.returnValue(of({ success: true, data: { items: [], totalCount: 0 } }));
    }
    api.getEndpoints.and.returnValue(of({ success: true, data: { items: [ep], totalCount: 1, pageNumber: 1, pageSize: 500, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }));
    api.getEndpoint.and.returnValue(of({ success: true, data: ep }));
    api.getRules.and.returnValue(of({ success: true, data: [] }));
    api.getAssignments.and.returnValue(of({ success: true, data: [] }));
    api.getStandard.and.returnValue(of({ success: true, data: { id: 'standard-a', name: '[restricted]' } as any }));
    api.getValidationRuns.and.returnValue(of({ success: true, data: { items: [{ id: 'run-a', status: 'Completed' }], totalCount: 1 } as any }));
    notifications = jasmine.createSpyObj<NotificationService>('NotificationService', ['markRead', 'markAllRead', 'dismissToast', 'retryRealtime'], {
      notifications: signal([notice]), unreadCount: signal(1), toasts: signal([]),
      realtimeError: signal(false), errorKey: signal<string | null>(null), canMutate: context.canMutate
    });
    await TestBed.configureTestingModule({
      imports: [EndpointListComponent, EndpointDetailComponent, ChangeHistoryComponent, CodeGeneratorComponent,
        GovernanceDetailComponent, ComplianceReportComponent, DashboardComponent, NotificationBellComponent],
      providers: [provideRouter([]), provideNoopAnimations(),
        { provide: ApiService, useValue: api },
        { provide: OrganizationContextService, useValue: {
          ...context, changes$: new Subject<void>(), ready,
          membership: signal({ teamId: 'team-a' }),
          requireMutation: (key: string) => context.canMutate() && context.hasPermission(key)
        } },
        { provide: AuthService, useValue: { hasPermission: context.hasPermission } },
        { provide: ExportDocService, useValue: { export: jasmine.createSpy('export') } },
        { provide: NotificationService, useValue: notifications },
        { provide: TranslateService, useValue: { translations$: of({}), t: (key: string) => key } }]
    }).compileComponents();
  });

  it('hides Viewer endpoint mutations and copy, and blocks every callback without API calls', () => {
    const fixture = TestBed.createComponent(EndpointListComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.expandAll(); fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('endpoint-a');
    expect(el.textContent).toContain('org.structuralOnly');
    expect(el.textContent).toContain('1 endpoints.visibleRecords');
    expect(el.textContent).not.toContain('endpoints.uniqueEndpoints');
    expect(el.querySelector('.btn-star, .btn-share, .btn-select-mode, .btn-ep-share, .btn-ep-action:not(.btn-ep-export)')).toBeNull();
    expect((el.querySelector('.btn-ep-export') as HTMLButtonElement).disabled).toBeTrue();
    expect((el.querySelector('input[type="text"]') as HTMLInputElement).disabled).toBeTrue();
    c.onToggleFavorite(ep); c.removeShared(ep); c.openSharePanel(); c.openSharePanelForEndpoint(ep);
    c.openSharePanelForSelected(); c.doShare(); c.toggleSelectionMode();
    c.copyEndpoint(ep); c.onTagChanged('hidden'); c.onSearch({ target: { value: 'hidden' } } as unknown as Event);
    c.onEnvChanged('env-a');
    expect(api.toggleFavorite).not.toHaveBeenCalled();
    expect(api.removeShared).not.toHaveBeenCalled();
    expect(api.shareFavorites).not.toHaveBeenCalled();
    expect(api.getEndpoint).not.toHaveBeenCalled();
    expect(api.getEndpointTags).not.toHaveBeenCalled();
    expect(c.showSharePanel()).toBeFalse();
    expect(c.selectionMode()).toBeFalse();
  });

  it('does not collapse redacted endpoint paths or environment groups', () => {
    const fixture = TestBed.createComponent(EndpointListComponent);
    const c = fixture.componentInstance;
    c.endpoints.set([ep, { ...ep, id: 'endpoint-b' }]);
    c.environments.set([
      { id: 'env-a', systemId: 'system-a', systemName: '[restricted]', name: '[restricted]' },
      { id: 'env-b', systemId: 'system-b', systemName: '[restricted]', name: '[restricted]' }
    ] as any);
    expect(c.uniqueEndpointCount()).toBe(2);
    viewer.set(false);
    expect(c.envOptions().length).toBe(2);
    expect(c.uniqueEndpointCount()).toBe(1);
  });

  it('keeps Workbench endpoint history and code actions on Workbench-prefixed routes', () => {
    viewer.set(false);
    const fixture = TestBed.createComponent(EndpointDetailComponent);
    fixture.componentInstance.isWorkbench = true;
    fixture.componentInstance.endpoint.set(ep);
    fixture.componentInstance.loading.set(false);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('a[href="/workbench/endpoints/endpoint-a/history"]')).not.toBeNull();
    expect(element.querySelector('a[href="/workbench/endpoints/endpoint-a/code"]')).not.toBeNull();
    expect(element.querySelector('a[href="/endpoints/endpoint-a/history"]')).toBeNull();
    expect(element.querySelector('a[href="/endpoints/endpoint-a/code"]')).toBeNull();
  });

  it('preserves nonViewer favorite/share controls and callback, then fails closed when unready', () => {
    viewer.set(false);
    api.toggleFavorite.and.returnValue(of({ success: true, data: true }));
    const fixture = TestBed.createComponent(EndpointListComponent);
    fixture.detectChanges(); const c = fixture.componentInstance;
    c.expandAll(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.btn-star')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.btn-share')).not.toBeNull();
    c.onToggleFavorite(ep);
    expect(api.toggleFavorite).toHaveBeenCalledOnceWith(ep.id);
    expect(c.endpoints()[0].isFavorite).toBeTrue();
    ready.set(false); c.onToggleFavorite(ep);
    expect(api.toggleFavorite).toHaveBeenCalledTimes(1);
  });

  it('shows list 403 rather than empty success and preserves failure on rejected favorite', () => {
    api.getEndpoints.and.returnValue(forbidden());
    const fixture = TestBed.createComponent(EndpointListComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.forbidden');
    viewer.set(false); api.toggleFavorite.and.returnValue(forbidden());
    fixture.componentInstance.onToggleFavorite(ep);
    expect(fixture.componentInstance.errorKey()).toBe('org.forbidden');
  });

  it('makes Viewer notes readonly, removes sensitive links, and blocks direct saves', () => {
    const fixture = TestBed.createComponent(EndpointDetailComponent);
    fixture.detectChanges(); const c = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('a[href$="/history"], a[href$="/code"]')).toBeNull();
    c.activeTab = 'endpoints.detail.notes'; fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).readOnly).toBeTrue();
    expect(fixture.nativeElement.querySelector('.btn-primary')).toBeNull();
    c.saveNotes(); expect(api.updateEndpointNotes).not.toHaveBeenCalled();
    viewer.set(false); manage.set(false); c.saveNotes();
    expect(api.updateEndpointNotes).not.toHaveBeenCalled();
  });

  it('preserves authorized notes edits and sensitive links and reports rejected saves', () => {
    viewer.set(false);
    const fixture = TestBed.createComponent(EndpointDetailComponent);
    fixture.detectChanges(); const c = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('a[href$="/history"]')).not.toBeNull();
    c.activeTab = 'endpoints.detail.notes'; fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).readOnly).toBeFalse();
    api.updateEndpointNotes.and.returnValue(forbidden()); c.saveNotes(); fixture.detectChanges();
    expect(c.savingNotes()).toBeFalse();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.forbidden');
  });

  for (const type of [ChangeHistoryComponent, CodeGeneratorComponent]) {
    it(`${type.name} never fetches sensitive content for Viewer or renders empty success`, () => {
      const fixture = TestBed.createComponent(type as typeof CodeGeneratorComponent);
      fixture.detectChanges();
      expect(api.getChangeHistory).not.toHaveBeenCalled();
      expect(api.generateTypeScript).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.structuralOnly');
    });
    it(`${type.name} preserves nonViewer fetch and exposes backend 403`, () => {
      viewer.set(false); api.getChangeHistory.and.returnValue(forbidden()); api.generateTypeScript.and.returnValue(forbidden());
      const fixture = TestBed.createComponent(type as typeof CodeGeneratorComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.forbidden');
      expect(fixture.nativeElement.querySelector('.empty-state, .empty-block')).toBeNull();
    });
  }

  it('preserves real generated code rendering and blocks copy after context becomes restricted', () => {
    viewer.set(false);
    api.generateTypeScript.and.returnValue(of({ success: true, data: {
      typeScriptInterfaces: 'interface Example {}', angularServiceMethod: 'getExample() {}'
    } }));
    const fixture = TestBed.createComponent(CodeGeneratorComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('pre').textContent).toContain('interface Example');
    const clipboard = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    fixture.componentInstance.copy('interface Example {}');
    expect(clipboard).toHaveBeenCalledTimes(1);
    viewer.set(true); fixture.componentInstance.copy('interface Example {}'); fixture.detectChanges();
    expect(clipboard).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('pre')).toBeNull();
  });

  it('uses supplied structural system IDs for dashboard grouping and independent expansion', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const c = fixture.componentInstance;
    c.stats.set({ endpointsByEnvironment: [
      { environmentId: 'env-a', systemId: 'system-a', systemName: '[restricted]', totalEndpoints: 1 },
      { environmentId: 'env-b', systemId: 'system-a', systemName: '[restricted]', totalEndpoints: 2 },
      { environmentId: 'env-c', systemId: 'system-b', systemName: '[restricted]', totalEndpoints: 4 }
    ] } as any);
    expect(c.groupedBySystem().length).toBe(2);
    expect(c.groupedBySystem()[0].totalEndpoints).toBe(3);
    viewer.set(false);
    expect(c.groupedBySystem().length).toBe(2);
    expect(c.groupedBySystem()[0].envCount).toBe(2);
    c.toggleSystem('system-a');
    expect(c.isSystemExpanded('system-a')).toBeTrue();
    expect(c.isSystemExpanded('system-b')).toBeFalse();
  });

  it('offers dashboard empty-state creation only with live environment management and mutation eligibility', () => {
    api.getDashboardStats.and.returnValue(of({ success: true, data: {
      totalTeams: 0, totalSystems: 0, totalEnvironments: 0, totalEndpoints: 0,
      uniqueEndpoints: 0, newEndpoints: 0, modifiedEndpoints: 0, deletedEndpoints: 0,
      brokenSwaggerUrls: 0, endpointsByEnvironment: [], recentSyncs: []
    } }));
    const fixture = TestBed.createComponent(DashboardComponent);
    const links = () => fixture.nativeElement.querySelectorAll('a[href="/environments"]').length;
    fixture.detectChanges();
    expect(links()).toBe(0);
    viewer.set(false); manage.set(false); fixture.detectChanges();
    expect(links()).toBe(0);
    manage.set(true); fixture.detectChanges();
    expect(links()).toBe(2);
    ready.set(false); fixture.detectChanges();
    expect(links()).toBe(0);
  });

  it('blocks Viewer governance deletion, management callbacks and scope metadata fetches', () => {
    const fixture = TestBed.createComponent(GovernanceDetailComponent);
    fixture.detectChanges(); const c = fixture.componentInstance;
    c.activeTab = 'runs'; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.btn-danger')).toBeNull();
    c.deleteRun('run-a'); c.deleteRule('rule-a'); c.removeAssignment('assignment-a');
    c.openRuleForm(); c.openAssignmentForm(); c.submitRule(); c.submitAssignment();
    expect(api.deleteValidationRun).not.toHaveBeenCalled();
    expect(api.deleteRule).not.toHaveBeenCalled();
    expect(api.removeAssignment).not.toHaveBeenCalled();
    expect(api.getTeams).not.toHaveBeenCalled();
    expect(c.showRuleForm).toBeFalse();
    expect(c.showAssignmentForm).toBeFalse();
  });

  it('preserves governance.manage deletion for nonViewer and reports rejected deletes', () => {
    viewer.set(false); spyOn(window, 'confirm').and.returnValue(true);
    const fixture = TestBed.createComponent(GovernanceDetailComponent);
    fixture.detectChanges(); const c = fixture.componentInstance;
    c.activeTab = 'runs'; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.btn-danger')).not.toBeNull();
    api.deleteValidationRun.and.returnValue(forbidden()); c.deleteRun('run-a'); fixture.detectChanges();
    expect(api.deleteValidationRun).toHaveBeenCalledOnceWith('run-a');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.forbidden');
  });

  it('blocks governance run deletion without the backend governance.manage permission', () => {
    viewer.set(false); manage.set(false);
    const fixture = TestBed.createComponent(GovernanceDetailComponent);
    fixture.detectChanges(); fixture.componentInstance.activeTab = 'runs'; fixture.detectChanges();
    fixture.componentInstance.deleteRun('run-a');
    expect(api.deleteValidationRun).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('button.btn-danger')).toBeNull();
  });

  it('governance read errors are explicit rather than a successful empty runs table', () => {
    api.getValidationRuns.and.returnValue(forbidden());
    const fixture = TestBed.createComponent(GovernanceDetailComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.forbidden');
    expect(fixture.componentInstance.loading()).toBeFalse();
  });

  it('compliance report hides Viewer path search, ignores stale search, and shows structural IDs', () => {
    api.getComplianceReport.and.returnValue(of({ success: true, data: {
      standardName: '[restricted]', runDate: '2026-10-03', overallScore: 100,
      totalEndpoints: 1, passedEndpoints: 1, failedEndpoints: 0, severityBreakdown: [],
      endpointSummaries: [{ endpointId: ep.id, path: '[restricted]', method: 'GET', tag: '[restricted]',
        complianceScore: 100, passedRules: 1, failedRules: 0, skippedRules: 0, violations: [] }]
    } as any }));
    const fixture = TestBed.createComponent(ComplianceReportComponent); fixture.detectChanges();
    const c = fixture.componentInstance;
    c.searchPath = 'not-a-real-path'; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.filter-search')).toBeNull();
    expect(c.filteredSummaries.length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain(ep.id);
    expect(fixture.nativeElement.textContent).toContain('org.structuralOnly');
    viewer.set(false); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.filter-search')).not.toBeNull();
    expect(c.filteredSummaries.length).toBe(0);
    c.searchPath = '[restricted]'; fixture.detectChanges();
    expect(c.filteredSummaries.length).toBe(1);
  });

  it('compliance report 403 is visible rather than an empty successful report', () => {
    api.getComplianceReport.and.returnValue(forbidden());
    const fixture = TestBed.createComponent(ComplianceReportComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.forbidden');
    expect(fixture.nativeElement.querySelector('.empty-state')).toBeNull();
    expect(fixture.componentInstance.loading()).toBeFalse();
  });

  it('dashboard read failures show an alert and malformed restricted groups are never fabricated', () => {
    api.getDashboardStats.and.returnValue(forbidden());
    const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.forbidden');
    fixture.componentInstance.stats.set({ endpointsByEnvironment: [
      { environmentId: 'env-a', systemName: '[restricted]', totalEndpoints: 1 },
      { environmentId: 'env-b', systemName: '[restricted]', totalEndpoints: 2 }
    ] } as any);
    expect(fixture.componentInstance.groupedBySystem().length).toBe(0);
    expect(fixture.componentInstance.contractError()).toBeTrue();
  });

  it('reports missing Viewer system IDs as an explicit contract error, preserving nonViewer legacy grouping', () => {
    api.getDashboardStats.and.returnValue(of({ success: true, data: { endpointsByEnvironment: [
      { environmentId: 'env-a', systemName: 'Legacy system', totalEndpoints: 1 },
      { environmentId: 'env-b', systemName: 'Legacy system', totalEndpoints: 2 }
    ] } as any }));
    const fixture = TestBed.createComponent(DashboardComponent); fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.contractError()).toBeTrue();
    expect(c.groupedBySystem()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.requestFailed');
    expect(fixture.nativeElement.querySelector('.dashboard-content')).toBeNull();
    viewer.set(false);
    expect(c.contractError()).toBeFalse();
    expect(c.groupedBySystem().length).toBe(1);
    expect(c.groupedBySystem()[0].totalEndpoints).toBe(3);
  });

  it('Viewer can open share notifications without implicit mark-read and cannot mark-all', () => {
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(NotificationBellComponent); fixture.detectChanges();
    const c = fixture.componentInstance; c.toggle(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notif-panel-header .notif-mark-all')).toBeNull();
    c.markAll(); c.clickNotif(notice);
    expect(notifications.markAllRead).not.toHaveBeenCalled();
    expect(notifications.markRead).not.toHaveBeenCalled();
    viewer.set(false); c.markAll(); c.clickNotif(notice);
    expect(notifications.markAllRead).toHaveBeenCalledTimes(1);
    expect(notifications.markRead).toHaveBeenCalledOnceWith(notice.id);
  });

  it('notification failures show the translated alert, not empty success', () => {
    notifications.notifications.set([]);
    notifications.errorKey.set('org.forbidden');
    const fixture = TestBed.createComponent(NotificationBellComponent); fixture.detectChanges();
    fixture.componentInstance.toggle(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.forbidden');
    expect(fixture.nativeElement.textContent).not.toContain('No notifications yet');
  });
});

describe('NotificationService read-only callbacks', () => {
  let service: NotificationService;
  let mutate: ReturnType<typeof signal<boolean>>;
  let api: jasmine.SpyObj<ApiService>;
  beforeEach(() => {
    mutate = signal(false);
    api = jasmine.createSpyObj<ApiService>('ApiService', ['markNotificationRead', 'markAllNotificationsRead', 'getNotifications']);
    api.markNotificationRead.and.returnValue(of({ success: true, data: true }));
    api.markAllNotificationsRead.and.returnValue(of({ success: true, data: true }));
    TestBed.configureTestingModule({ providers: [
      NotificationService,
      { provide: ApiService, useValue: api },
      { provide: OrganizationContextService, useValue: { canMutate: mutate, ready: signal(true), changes$: new Subject<void>(), reportApiError: jasmine.createSpy('reportApiError') } },
      { provide: OrganizationRealtimeService, useValue: { error: signal(false), notifications$: new Subject(), synchronized$: new Subject(), start: () => {}, stop: () => {} } }
    ] });
    service = TestBed.inject(NotificationService);
    service.notifications.set([{ id: 'n', isRead: false } as AppNotification]);
  });
  it('blocks Viewer and unready calls at the service boundary, preserving unread state', () => {
    service.markRead('n'); service.markAllRead();
    expect(api.markNotificationRead).not.toHaveBeenCalled();
    expect(api.markAllNotificationsRead).not.toHaveBeenCalled();
    expect(service.unreadCount()).toBe(1);
  });
  it('preserves nonViewer mutation and rejects 403 without optimistic state changes', () => {
    mutate.set(true);
    api.markNotificationRead.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    service.markRead('n');
    expect(service.errorKey()).toBe('org.forbidden');
    expect(service.unreadCount()).toBe(1);
    service.markAllRead();
    expect(api.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(service.unreadCount()).toBe(0);
  });
  it('rejects mark-all 403 without clearing unread state', () => {
    mutate.set(true);
    api.markAllNotificationsRead.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    service.markAllRead();
    expect(service.errorKey()).toBe('org.forbidden');
    expect(service.unreadCount()).toBe(1);
  });
  it('reports snapshot 403 and keeps the real service connected without empty success', () => {
    api.getNotifications.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    service.init();
    expect(service.error()).toBeTrue();
    expect(service.errorKey()).toBe('org.forbidden');
  });
});
