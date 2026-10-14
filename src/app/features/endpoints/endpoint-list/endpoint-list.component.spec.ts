import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { By } from '@angular/platform-browser';
import { of, Subject, throwError } from 'rxjs';
import { ApiResponse, EndpointDetail, EndpointListItem, PagedResult } from '../../../core/models/models';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ExportDocService } from '../../../core/services/export-doc.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { TranslateService } from '../../../core/services/translate.service';
import { EndpointRunnerComponent } from '../endpoint-runner/endpoint-runner.component';
import { EndpointListComponent } from './endpoint-list.component';

const first: EndpointListItem = {
  id: 'endpoint-a', method: 'GET', path: '/orders/{id}', summary: 'Find an order',
  systemId: 'system-a', systemName: 'Orders API', environmentId: 'env-a', environmentName: 'Production',
  teamId: 'team-a', teamName: 'Commerce', tag: 'Orders', changeStatus: 'Unchanged',
  isDeprecated: false, isFavorite: false, isShared: false, isNew: false
};
const second: EndpointListItem = { ...first, id: 'endpoint-b', method: 'POST', path: '/orders', summary: 'Create order' };
const detail = (endpoint: EndpointListItem): EndpointDetail => ({
  ...endpoint, baseUrl: 'https://example.invalid', description: 'Order resource documentation',
  parameters: [], headers: [], requestBodies: [], responses: []
});
const page = (items: EndpointListItem[], totalCount = items.length): PagedResult<EndpointListItem> => ({
  items, totalCount, pageNumber: 1, pageSize: 500, totalPages: Math.ceil(totalCount / 500),
  hasNextPage: totalCount > items.length, hasPreviousPage: false
});

describe('EndpointListComponent resource workspace', () => {
  let api: jasmine.SpyObj<ApiService>;
  let permissions: Set<string>;
  let structuralOnly: ReturnType<typeof signal<boolean>>;
  let exportDoc: jasmine.SpyObj<ExportDocService>;
  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getEndpoints', 'getEnvironments', 'getEndpoint', 'getAuthProfiles', 'getRequestHistory',
      'getEndpointTags', 'getSwaggerSources', 'getTeams', 'toggleFavorite', 'shareFavorites',
      'removeShared', 'runRequest', 'updateEndpointNotes'
    ]);
    api.getEndpoints.and.returnValue(of({ success: true, data: page([first, second]) }));
    api.getEnvironments.and.returnValue(of({ success: true, data: {
      items: [], totalCount: 0, pageNumber: 1, pageSize: 20, totalPages: 0,
      hasNextPage: false, hasPreviousPage: false
    } }));
    api.getEndpoint.and.callFake(id => of({ success: true, data: detail(id === second.id ? second : first) }));
    api.getAuthProfiles.and.returnValue(of({ success: true, data: [] }));
    api.getRequestHistory.and.returnValue(of({ success: true, data: {
      items: [], totalCount: 0, pageNumber: 1, pageSize: 20, totalPages: 0,
      hasNextPage: false, hasPreviousPage: false
    } }));
    api.getEndpointTags.and.returnValue(of({ success: true, data: ['Orders'] }));
    api.getSwaggerSources.and.returnValue(of({ success: true, data: [] }));
    api.toggleFavorite.and.returnValue(of({ success: true, data: true }));
    api.shareFavorites.and.returnValue(of({ success: true, data: 1 }));
    api.removeShared.and.returnValue(of({ success: true }));
    permissions = new Set(['endpoints.view']);
    structuralOnly = signal(false);
    exportDoc = jasmine.createSpyObj<ExportDocService>('ExportDocService', ['export']);
    await TestBed.configureTestingModule({
      imports: [EndpointListComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([
          { path: 'workbench/endpoints', component: EndpointListComponent },
          { path: 'endpoints', component: EndpointListComponent }
        ]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { hasPermission: (key: string) => permissions.has(key) } },
        { provide: ExportDocService, useValue: exportDoc },
        { provide: OrganizationContextService, useValue: {
          structuralOnly, canMutate: () => !structuralOnly(),
          hasPermission: (key: string) => permissions.has(key),
          canAccessSensitiveContent: () => !structuralOnly(),
          membership: signal(null), activeOrganization: signal({ id: 'org-a', name: 'Commerce' })
        } },
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
  });

  async function render(url = '/workbench/endpoints') {
    const harness = await RouterTestingHarness.create(url);
    harness.detectChanges();
    return { harness, element: harness.routeNativeElement!,
      component: harness.routeDebugElement!.componentInstance as EndpointListComponent };
  }

  it('replaces all legacy page composition with an explorer and selected endpoint documentation', async () => {
    const { element } = await render();
    expect(element.querySelector('.page-header, .header-actions, .filter-bar, .accordion, .sub-accordion')).toBeNull();
    expect(element.querySelector('.explorer-pane')).not.toBeNull();
    expect(element.querySelector('.selected-workspace')).not.toBeNull();
    expect(element.querySelector('.resource-endpoint-row.is-active')?.textContent).toContain(first.path);
    expect(element.querySelector('app-endpoint-detail .documentation-overview')).not.toBeNull();
    expect(element.querySelector('app-endpoint-runner')).toBeNull();
    expect(api.getEndpoint).toHaveBeenCalledWith(first.id);
  });

  it('exposes a keyboard-accessible horizontal scroll region and mobile hint for parameter columns', async () => {
    api.getEndpoint.and.returnValue(of({
      success: true,
      data: {
        ...detail(first),
        parameters: [{
          id: 'parameter-limit', name: 'limit', location: 'Query', schema: 'integer', required: false,
          description: 'Maximum number of returned records'
        }]
      }
    }));
    const { element } = await render();
    const hint = element.querySelector('.table-scroll-hint');
    const scrollRegion = element.querySelector('.param-table-scroll');
    expect(hint?.textContent).toContain('endpoints.detail.tableScrollHint');
    expect(scrollRegion?.getAttribute('role')).toBe('region');
    expect(scrollRegion?.getAttribute('tabindex')).toBe('0');
    expect(scrollRegion?.querySelector('table.param-table')).not.toBeNull();
  });

  it('keeps the legacy header, filters and accordions only on /endpoints without a new detail read', async () => {
    const { element } = await render('/endpoints');
    expect(element.querySelector('.page-header')).not.toBeNull();
    expect(element.querySelector('.filter-bar')).not.toBeNull();
    expect(element.querySelector('.accordion')).not.toBeNull();
    expect(element.querySelector('.endpoint-workspace')).toBeNull();
    expect(api.getEndpoint).not.toHaveBeenCalled();
  });

  it('selects another endpoint in place and recreates the existing detail component with the selected ID', async () => {
    const { harness, element, component } = await render();
    component.selectEndpoint(second);
    harness.detectChanges();
    expect(element.querySelector('.selected-resource-title')?.textContent).toContain(second.path);
    expect(api.getEndpoint).toHaveBeenCalledWith(second.id);
    expect(element.querySelector('.open-resource')?.getAttribute('href')).toBe('/workbench/endpoints/endpoint-b');
  });

  it('uses the existing runner only with execution permission and preserves edits when visiting documentation', async () => {
    permissions.add('endpoints.run');
    const { harness, element, component } = await render();
    const runner = harness.routeDebugElement!.query(By.directive(EndpointRunnerComponent)).componentInstance as EndpointRunnerComponent;
    expect(runner).toBeDefined();
    runner.requestBody = '{"edited":true}';
    component.workspaceTab.set('details');
    harness.detectChanges();
    expect(element.querySelector('app-endpoint-runner')?.hasAttribute('hidden')).toBeTrue();
    component.workspaceTab.set('request');
    harness.detectChanges();
    expect(runner.requestBody).toBe('{"edited":true}');
    expect(element.querySelector('app-endpoint-runner')?.hasAttribute('hidden')).toBeFalse();
    expect(api.runRequest).not.toHaveBeenCalled();
  });

  it('does not retain request/response state when selecting a different endpoint', async () => {
    permissions.add('endpoints.run');
    const { harness, component } = await render();
    component.selectEndpoint(second);
    harness.detectChanges();
    expect(api.getEndpoint).toHaveBeenCalledWith(second.id);
    expect(harness.routeNativeElement!.querySelectorAll('app-endpoint-runner').length).toBe(1);
  });

  it('keeps Viewer structural-only, without reconstructing catalogue text or mutation/execution actions', async () => {
    structuralOnly.set(true);
    const { element, component } = await render();
    expect(element.querySelector('.resource-endpoint-row')?.textContent).toContain(first.id);
    expect(element.querySelector('.resource-endpoint-row')?.textContent).not.toContain(first.path);
    expect(element.querySelector('.selected-resource-title')?.textContent).toContain(first.id);
    expect(element.querySelector('input[type="search"], app-endpoint-runner')).toBeNull();
    expect(element.textContent).not.toContain(first.summary!);
    expect(element.textContent).not.toContain('Order resource documentation');
    expect(element.textContent).not.toContain('endpoints.detail.changeHistory');
    expect(element.textContent).not.toContain('endpoints.detail.generateCode');
    component.onToggleFavorite(first);
    component.openSharePanelForEndpoint(first);
    component.toggleSelectionMode();
    component.copyEndpoint(first);
    expect(api.toggleFavorite).not.toHaveBeenCalled();
    expect(api.shareFavorites).not.toHaveBeenCalled();
    expect(component.showSharePanel()).toBeFalse();
    expect(component.selectionMode()).toBeFalse();
  });

  it('shows 403 as an explicit denied read without initializing a selected workspace', async () => {
    api.getEndpoints.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const { element } = await render();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('org.forbidden');
    expect(element.querySelector('app-endpoint-detail, app-endpoint-runner')).toBeNull();
  });

  it('does not turn a denied detail read into a successful empty editor', async () => {
    api.getEndpoint.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const { element } = await render();
    expect(element.querySelector('app-endpoint-detail [role="alert"]')?.textContent).toContain('org.forbidden');
  });

  it('renders loading and empty states without legacy structures', async () => {
    const pending = new Subject<ApiResponse<PagedResult<EndpointListItem>>>();
    api.getEndpoints.and.returnValue(pending);
    const { harness, element } = await render();
    expect(element.textContent).toContain('workspace.loading');
    pending.next({ success: true, data: page([]) });
    harness.detectChanges();
    expect(element.textContent).toContain('endpoints.noEndpoints');
    expect(element.textContent).toContain('workspace.selectHint');
    expect(element.querySelector('.accordion')).toBeNull();
  });

  it('keeps filters progressively disclosed and passes them to the unchanged endpoint API', async () => {
    const { harness, element, component } = await render();
    expect(element.querySelector('.explorer-filters')).toBeNull();
    component.showFilters.set(true);
    harness.detectChanges();
    expect(element.querySelector('.explorer-filters')).not.toBeNull();
    component.onMethodChanged('POST');
    expect(api.getEndpoints).toHaveBeenCalledWith(jasmine.objectContaining({ method: 'POST', page: 1, pageSize: 500 }));
    component.onSystemChanged('system-a');
    expect(api.getEndpoints).toHaveBeenCalledWith(jasmine.objectContaining({ systemId: 'system-a' }));
  });

  it('preserves favorites, shared filters, selection and the existing share form', async () => {
    const { harness, component, element } = await render();
    component.toggleFavoritesFilter();
    expect(api.getEndpoints).toHaveBeenCalledWith(jasmine.objectContaining({ favoritesOnly: true }));
    component.toggleSharedFilter();
    expect(api.getEndpoints).toHaveBeenCalledWith(jasmine.objectContaining({ favoritesOnly: false, sharedWithMeOnly: true }));
    component.toggleSelectionMode();
    component.toggleSelection(first, new Event('change'));
    component.openSharePanelForSelected();
    harness.detectChanges();
    expect(element.querySelector('.share-panel')).not.toBeNull();
    component.shareTarget = 'recipient';
    component.doShare();
    expect(api.shareFavorites).toHaveBeenCalledWith({ targetUser: 'recipient', endpointIds: [first.id] });
    expect(component.selectionMode()).toBeFalse();
  });

  it('preserves pagination and clears filtered-out active endpoint content', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => ({ ...first, id: `endpoint-${index}` }));
    api.getEndpoints.and.returnValue(of({ success: true, data: page(firstPage, 501) }));
    const { harness, component } = await render();
    expect(component.hasMore()).toBeTrue();
    api.getEndpoints.and.returnValue(of({ success: true, data: page([second], 501) }));
    component.loadMore();
    expect(api.getEndpoints).toHaveBeenCalledWith(jasmine.objectContaining({ page: 2 }));
    expect(component.endpoints().length).toBe(501);
    api.getEndpoints.and.returnValue(of({ success: true, data: page([]) }));
    component.onMethodChanged('DELETE');
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('app-endpoint-detail')).toBeNull();
    expect(component.activeEndpoint()).toBeNull();
  });

  it('preserves authorized contextual export and favorite commands', async () => {
    permissions.add('export.view');
    const { component } = await render();
    component.exportEndpoint(first);
    component.onToggleFavorite(first);
    expect(exportDoc.export).toHaveBeenCalledWith({ type: 'endpoints', label: 'GET /orders/{id}', endpointIds: [first.id] });
    expect(api.toggleFavorite).toHaveBeenCalledWith(first.id);
    expect(component.endpoints()[0].isFavorite).toBeTrue();
  });
});
