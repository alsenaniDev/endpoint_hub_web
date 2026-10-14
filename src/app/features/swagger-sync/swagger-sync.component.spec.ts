import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { ApiResponse, EnvironmentSyncStatus, SwaggerSourceDto } from '../../core/models/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ExportDocService } from '../../core/services/export-doc.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { TranslateService } from '../../core/services/translate.service';
import { SwaggerSyncComponent } from './swagger-sync.component';

const sourceA: EnvironmentSyncStatus = {
  environmentId: 'env-a', environmentName: 'Production [v1]', systemName: 'Identity API',
  swaggerSourceId: 'source-a', swaggerUrl: 'https://example.invalid/private.json',
  lastStatus: 'Success', totalEndpoints: 1, lastSyncedAt: '2026-10-01T10:00:00Z'
};
const sourceB: EnvironmentSyncStatus = {
  ...sourceA, swaggerSourceId: 'source-b', environmentName: 'Production [v2]', lastStatus: 'Partial'
};
const metadata: SwaggerSourceDto = {
  id: 'source-a', environmentId: 'env-a', label: 'Identity v1', url: sourceA.swaggerUrl!,
  baseUrl: 'https://example.invalid/private', isActive: true, createdAt: '2026-10-01T10:00:00Z'
};

describe('Swagger source documentation workspace', () => {
  let api: jasmine.SpyObj<ApiService>;
  let permissions: Set<string>;
  let structural: ReturnType<typeof signal<boolean>>;
  let requireMutation: jasmine.Spy;

  beforeEach(async () => {
    permissions = new Set(['swaggersync.view', 'environments.view', 'endpoints.view']);
    structural = signal(false);
    requireMutation = jasmine.createSpy().and.callFake((key: string) => !structural() && permissions.has(key));
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getAllSyncStatus', 'getSwaggerSources', 'getEndpoints', 'getEndpoint', 'getEnvironments',
      'getSyncSchedule', 'updateSyncSchedule', 'triggerAllSync', 'syncSwagger', 'getSyncLogs'
    ]);
    api.getAllSyncStatus.and.returnValue(of({ success: true, data: [sourceA, sourceB] }));
    api.getSwaggerSources.and.returnValue(of({ success: true, data: [metadata, { ...metadata, id: 'source-b', label: 'Identity v2' }] }));
    const endpoint = {
      id: 'endpoint-a', path: '/auth/token', method: 'POST' as const, tag: 'Auth',
      summary: 'Sensitive summary', description: 'Sensitive description', systemId: 'system-a', systemName: 'Identity API',
      environmentId: 'env-a', environmentName: 'Production', teamId: 'team-a', teamName: 'Platform',
      isDeprecated: false, changeStatus: 'Unchanged' as const, isFavorite: false, isShared: false, isNew: false
    };
    api.getEndpoints.and.returnValue(of({ success: true, data: {
      items: [endpoint], totalCount: 1, pageNumber: 1, pageSize: 500, totalPages: 1,
      hasNextPage: false, hasPreviousPage: false
    } }));
    api.getEndpoint.and.returnValue(of({ success: true, data: {
      ...endpoint, baseUrl: metadata.baseUrl, parameters: [], headers: [], requestBodies: [], responses: []
    } }));
    api.getSyncSchedule.and.returnValue(of({ success: true, data: { isEnabled: false, cronExpression: '0 2 * * *', label: 'Daily' } }));
    api.updateSyncSchedule.and.returnValue(of({ success: true, data: { isEnabled: true, cronExpression: '0 2 * * *', label: 'Daily' } }));
    api.triggerAllSync.and.returnValue(of({ success: true, data: 'queued' }));
    api.getSyncLogs.and.returnValue(of({ success: true, data: {
      items: [], totalCount: 0, pageNumber: 1, pageSize: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false
    } }));
    api.syncSwagger.and.returnValue(of({ success: true, data: {
      syncLogId: 'log', status: 'Success', totalEndpoints: 1, newEndpoints: 0, modifiedEndpoints: 0, deletedEndpoints: 0,
      syncedAt: '2026-10-01T10:00:00Z'
    } }));
    await TestBed.configureTestingModule({
      imports: [SwaggerSyncComponent],
      providers: [
        provideRouter([
          { path: 'workbench/swagger', component: SwaggerSyncComponent },
          { path: 'swagger-sync', component: SwaggerSyncComponent }
        ]), provideNoopAnimations(),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { hasPermission: (key: string) => permissions.has(key) } },
        { provide: OrganizationContextService, useValue: {
          structuralOnly: structural, canMutate: () => !structural(),
          canAccessSensitiveContent: () => !structural(), hasPermission: (key: string) => permissions.has(key),
          activeOrganization: signal({ id: 'org-a', name: 'Active organization' }),
          membership: signal(null), requireMutation
        } },
        { provide: ExportDocService, useValue: { export: jasmine.createSpy() } },
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
  });

  async function render(url = '/workbench/swagger') {
    const harness = await RouterTestingHarness.create(url);
    harness.detectChanges();
    return { harness, element: harness.routeNativeElement!,
      component: harness.routeDebugElement!.componentInstance as SwaggerSyncComponent };
  }

  it('replaces the legacy status table with source navigation, documentation and a source inspector', async () => {
    const { element } = await render();
    expect(element.querySelector('.page-header, .status-table')).toBeNull();
    expect(element.querySelector('.api-source-navigation')).not.toBeNull();
    expect(element.querySelector('.imported-documentation app-endpoint-list')).not.toBeNull();
    expect(element.querySelector('.source-inspector')).not.toBeNull();
    expect(element.querySelectorAll('.api-source-row').length).toBe(2);
    expect(element.textContent).toContain('Active organization');
    expect(api.getEndpoints).toHaveBeenCalledWith(jasmine.objectContaining({ environmentId: 'env-a', swaggerSourceId: 'source-a' }));
    expect(api.getEnvironments).not.toHaveBeenCalled();
    expect(element.querySelector('app-endpoint-runner')).toBeNull();
  });

  it('keeps the legacy Swagger route and avoids new source/documentation reads there', async () => {
    const { element } = await render('/swagger-sync');
    expect(element.querySelector('.page-header')).not.toBeNull();
    expect(element.querySelector('.status-table')).not.toBeNull();
    expect(element.querySelector('.api-documentation-layout')).toBeNull();
    expect(api.getSwaggerSources).not.toHaveBeenCalled();
    expect(api.getEndpoints).not.toHaveBeenCalled();
  });

  it('switches between sources in the same environment with distinct source-scoped endpoint reads', async () => {
    const { harness, component, element } = await render();
    component.selectSource(sourceB);
    harness.detectChanges();
    expect(api.getEndpoints).toHaveBeenCalledWith(jasmine.objectContaining({ environmentId: 'env-a', swaggerSourceId: 'source-b' }));
    expect(element.querySelector('.api-source-title')?.textContent).toContain('Identity v2');
    expect(element.querySelectorAll('app-endpoint-list').length).toBe(1);
  });

  it('preserves the legacy single-URL source without inventing a source ID', async () => {
    api.getAllSyncStatus.and.returnValue(of({ success: true, data: [{ ...sourceA, swaggerSourceId: undefined }] }));
    await render();
    expect(api.getSwaggerSources).not.toHaveBeenCalled();
    expect(api.getEndpoints).toHaveBeenCalledWith(jasmine.objectContaining({ environmentId: 'env-a', swaggerSourceId: undefined }));
  });

  it('never loads endpoint documentation when only Swagger status read is available', async () => {
    permissions = new Set(['swaggersync.view']);
    const { element } = await render();
    expect(api.getEndpoints).not.toHaveBeenCalled();
    expect(api.getEndpoint).not.toHaveBeenCalled();
    expect(api.getSwaggerSources).not.toHaveBeenCalled();
    expect(element.textContent).toContain('swaggerWorkspace.documentationRestricted');
  });

  it('keeps Viewer structural-only even when test DTOs contain arbitrary text and secrets', async () => {
    structural.set(true);
    const { harness, component, element } = await render();
    expect(element.querySelector('.api-source-row')?.textContent).toContain('source-a');
    expect(element.textContent).not.toContain('Identity API');
    expect(element.textContent).not.toContain('Sensitive summary');
    expect(element.textContent).not.toContain('Sensitive description');
    component.activeTab.set('source');
    harness.detectChanges();
    expect(element.textContent).not.toContain('https://example.invalid/private');
    expect(element.textContent).not.toContain('Identity v1');
    component.runNow();
    component.syncEnv(sourceA);
    component.saveSchedule();
    expect(api.triggerAllSync).not.toHaveBeenCalled();
    expect(api.syncSwagger).not.toHaveBeenCalled();
    expect(api.updateSyncSchedule).not.toHaveBeenCalled();
    expect(element.querySelector('app-endpoint-runner')).toBeNull();
  });

  it('displays loading then an honest empty-source state', async () => {
    const pending = new Subject<ApiResponse<EnvironmentSyncStatus[]>>();
    api.getAllSyncStatus.and.returnValue(pending);
    const { harness, element } = await render();
    expect(element.textContent).toContain('swaggerWorkspace.loading');
    pending.next({ success: true, data: [] });
    harness.detectChanges();
    expect(element.textContent).toContain('swaggerWorkspace.noSources');
    expect(element.querySelector('app-endpoint-list')).toBeNull();
  });

  it('shows a forbidden status read instead of an empty successful documentation workspace', async () => {
    api.getAllSyncStatus.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const { element } = await render();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('org.forbidden');
    expect(api.getEndpoints).not.toHaveBeenCalled();
  });

  it('reports source metadata denial without leaking the previous source metadata', async () => {
    const { harness, component, element } = await render();
    api.getSwaggerSources.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component.selectSource(sourceB);
    component.activeTab.set('source');
    harness.detectChanges();
    expect(component.sourceMetadata()).toBeNull();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('org.forbidden');
    expect(element.textContent).not.toContain(metadata.baseUrl);
  });

  it('ignores late metadata responses after selecting another source', async () => {
    const pending = new Subject<ApiResponse<SwaggerSourceDto[]>>();
    api.getSwaggerSources.and.returnValue(pending);
    const { component } = await render();
    api.getSwaggerSources.and.returnValue(of({ success: true, data: [{ ...metadata, id: 'source-b', label: 'v2' }] }));
    component.selectSource(sourceB);
    pending.next({ success: true, data: [metadata] });
    expect(component.sourceMetadata()?.id).toBe('source-b');
  });

  it('does not fetch Swagger documents or execute requests when browsing source details', async () => {
    const { harness, component, element } = await render();
    component.activeTab.set('source');
    harness.detectChanges();
    expect(element.textContent).toContain(metadata.url);
    expect(element.querySelector('a[href^="https://"]')).toBeNull();
    expect(api.syncSwagger).not.toHaveBeenCalled();
    expect(api.triggerAllSync).not.toHaveBeenCalled();
  });

  it('preserves documentation selection while inspecting source configuration and sync state', async () => {
    const { harness, component } = await render();
    const calls = api.getEndpoints.calls.count();
    component.activeTab.set('source');
    harness.detectChanges();
    component.activeTab.set('documentation');
    harness.detectChanges();
    expect(api.getEndpoints.calls.count()).toBe(calls);
  });

  it('keeps sync controls absent and callbacks denied without the existing run permission', async () => {
    const { component, element } = await render();
    component.syncEnv(sourceA);
    component.runNow();
    expect(api.syncSwagger).not.toHaveBeenCalled();
    expect(api.triggerAllSync).not.toHaveBeenCalled();
    expect(element.querySelector('.api-source-title button')).toBeNull();
    expect(element.textContent).toContain('swaggerWorkspace.syncRestricted');
  });

  it('uses the unchanged environment-level synchronization and surfaces a backend 403', async () => {
    permissions.add('swaggersync.run');
    const { harness, component, element } = await render();
    api.syncSwagger.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component.syncEnv(sourceA);
    harness.detectChanges();
    expect(requireMutation).toHaveBeenCalledWith('swaggersync.run');
    expect(api.syncSwagger).toHaveBeenCalledWith('env-a');
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('org.forbidden');
    expect(component.syncingEnvId()).toBeNull();
  });

  it('does not treat unsuccessful synchronization responses as completed operations', async () => {
    permissions.add('swaggersync.run');
    const { component } = await render();
    api.triggerAllSync.and.returnValue(of({ success: false }));
    component.runNow();
    expect(component.running()).toBeFalse();
    expect(component.actionError()).toBe('org.requestFailed');
    api.syncSwagger.and.returnValue(of({ success: false }));
    component.syncEnv(sourceA);
    expect(component.actionError()).toBe('org.requestFailed');
  });

  it('reuses the existing schedule editor as a Workbench drawer only when authorized', async () => {
    permissions.add('swaggersync.manageschedule');
    const { harness, component, element } = await render();
    expect(api.getSyncSchedule).toHaveBeenCalled();
    expect(element.querySelector('.swagger-workspace > .card')).toBeNull();
    component.showSchedule.set(true);
    harness.detectChanges();
    expect(element.querySelector('.swagger-workspace > .card')).not.toBeNull();
    component.selectPreset(component.presets[1]);
    component.saveSchedule();
    expect(requireMutation).toHaveBeenCalledWith('swaggersync.manageschedule');
    expect(api.updateSyncSchedule).toHaveBeenCalledWith(jasmine.objectContaining({ cronExpression: '0 */6 * * *' }));
  });

  it('keeps the existing custom cron builder behavior', async () => {
    const { component } = await render();
    component.customHour = 6;
    component.customMinute = 15;
    component.customWeekday = 1;
    component.setFrequency('weekly');
    expect(component.cronExpression).toBe('15 6 * * 1');
  });

  it('cancels pending status subscriptions on component destruction', async () => {
    const pending = new Subject<ApiResponse<EnvironmentSyncStatus[]>>();
    api.getAllSyncStatus.and.returnValue(pending);
    const { harness, component } = await render();
    harness.fixture.destroy();
    pending.next({ success: true, data: [sourceA] });
    expect(component.statusList()).toEqual([]);
  });

  it('loads real environment history on demand without claiming source-specific scope', async () => {
    const { harness, component, element } = await render();
    expect(api.getSyncLogs).not.toHaveBeenCalled();
    component.openSynchronization();
    harness.detectChanges();
    expect(api.getSyncLogs).toHaveBeenCalledWith('env-a');
    expect(element.textContent).toContain('swaggerWorkspace.historyScope');
    expect(element.textContent).toContain('swaggerWorkspace.noHistory');
  });

  it('surfaces history 403 responses instead of fabricating a successful empty timeline', async () => {
    const { harness, component, element } = await render();
    api.getSyncLogs.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component.openSynchronization();
    harness.detectChanges();
    expect(element.querySelector('.environment-history [role="alert"]')?.textContent).toContain('org.forbidden');
    expect(element.querySelector('.environment-history')?.textContent).not.toContain('swaggerWorkspace.noHistory');
  });
});
