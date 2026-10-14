import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { TranslateService } from '../../../core/services/translate.service';
import { EndpointDetail } from '../../../core/models/models';
import { EndpointRunnerComponent } from './endpoint-runner.component';

const endpoint: EndpointDetail = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  path: '/v1/orders/{orderId}',
  method: 'POST',
  tag: 'Orders',
  summary: 'Create an order',
  description: 'Creates a customer order.',
  operationId: 'createOrder',
  isDeprecated: false,
  changeStatus: 'Unchanged',
  lastSyncedAt: '2026-09-01T12:00:00Z',
  environmentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  environmentName: 'Development',
  baseUrl: 'https://api.example.test',
  systemId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  systemName: 'Orders API',
  teamId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  teamName: 'Commerce',
  parameters: [
    { id: 'p1', name: 'orderId', location: 'Path', required: true, example: '123' },
    { id: 'p2', name: 'expand', location: 'Query', required: false, example: 'items' }
  ],
  headers: [{ id: 'h1', name: 'Content-Type', required: true, defaultValue: 'application/json' }],
  requestBodies: [{
    id: 'b1', contentType: 'application/json', required: true,
    schema: '{"type":"object","properties":{"quantity":{"type":"integer"}}}'
  }],
  responses: [{ id: 'r1', statusCode: '201', description: 'Created', example: '{"id":"123"}' }]
};

describe('EndpointRunnerComponent Workbench presentation', () => {
  let api: jasmine.SpyObj<ApiService>;
  let auth: { hasPermission: jasmine.Spy };
  let organization: {
    structuralOnly: ReturnType<typeof signal<boolean>>;
    activeOrganization: ReturnType<typeof signal<{ id: string; name: string }>>;
    canAccessSensitiveContent: jasmine.Spy;
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getEndpoint', 'getAuthProfiles', 'runRequest', 'getRequestHistory'
    ]);
    api.getEndpoint.and.returnValue(of({ success: true, data: endpoint }));
    api.getAuthProfiles.and.returnValue(of({ success: true, data: [] }));
    api.getRequestHistory.and.returnValue(of({
      success: true,
      data: {
        items: [], totalCount: 0, pageNumber: 1, pageSize: 20, totalPages: 0,
        hasNextPage: false, hasPreviousPage: false
      }
    }));
    api.runRequest.and.returnValue(of({
      success: true,
      data: {
        isSuccess: true, statusCode: 201, responseHeaders: { 'content-type': 'application/json' },
        responseBody: '{"id":"created"}', responseTimeMs: 24
      }
    }));
    auth = { hasPermission: jasmine.createSpy().and.returnValue(false) };
    organization = {
      structuralOnly: signal(false),
      activeOrganization: signal({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: 'Commerce Org' }),
      canAccessSensitiveContent: jasmine.createSpy().and.returnValue(true)
    };

    await TestBed.configureTestingModule({
      imports: [EndpointRunnerComponent],
      providers: [
        provideRouter([
          { path: 'workbench/endpoints/:id/run', component: EndpointRunnerComponent },
          { path: 'endpoints/:id/run', component: EndpointRunnerComponent }
        ]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: OrganizationContextService, useValue: organization },
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
  });

  it('loads and renders run history only when endpoint read and sensitive-content access are available', async () => {
    auth.hasPermission.and.callFake((key: string) => key === 'endpoints.view');
    api.getRequestHistory.and.returnValue(of({
      success: true,
      data: {
        items: [{
          id: 'history-1', method: 'POST', url: 'https://api.example.test/v1/orders',
          statusCode: 201, responseTimeMs: 42, isSuccess: true, createdAt: '2026-09-01T12:00:00Z'
        }],
        totalCount: 1, pageNumber: 1, pageSize: 20, totalPages: 1,
        hasNextPage: false, hasPreviousPage: false
      }
    }));
    const harness = await RouterTestingHarness.create(
      '/workbench/endpoints/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/run'
    );
    harness.detectChanges();
    expect(api.getRequestHistory).toHaveBeenCalledWith(endpoint.id);
    expect(harness.routeNativeElement!.textContent).toContain('201');
    expect(harness.routeNativeElement!.textContent).toContain('42 ms');
    expect(harness.routeNativeElement!.querySelector('.run-history')?.textContent)
      .not.toContain('https://api.example.test');
  });

  it('renders the three-zone request workspace from the existing endpoint detail API', async () => {
    const harness = await RouterTestingHarness.create(
      '/workbench/endpoints/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/run'
    );
    harness.detectChanges();
    const root = harness.routeNativeElement!;
    expect(api.getEndpoint).toHaveBeenCalledWith(endpoint.id);
    expect(root.querySelector('.resource-pane')).not.toBeNull();
    expect(root.querySelector('.request-panel')).not.toBeNull();
    expect(root.querySelector('.response-panel')).not.toBeNull();
    expect(root.querySelector('.workbench-runner-layout')).not.toBeNull();
    expect(root.textContent).toContain('/v1/orders/{orderId}');
    expect(root.textContent).toContain('Development');
    expect(root.textContent).toContain('Order');
  });

  it('does not request or reveal AuthProfiles when authprofiles.view is absent', async () => {
    const harness = await RouterTestingHarness.create(
      '/workbench/endpoints/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/run'
    );
    harness.detectChanges();
    expect(api.getAuthProfiles).not.toHaveBeenCalled();
    expect(api.getRequestHistory).not.toHaveBeenCalled();
    expect(harness.routeNativeElement!.textContent).not.toContain('runner.authProfile');
  });

  it('loads AuthProfile choices only when their existing read permission is present', async () => {
    auth.hasPermission.and.callFake((key: string) => key === 'authprofiles.view');
    const harness = await RouterTestingHarness.create(
      '/workbench/endpoints/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/run'
    );
    harness.detectChanges();
    expect(api.getAuthProfiles).toHaveBeenCalledWith(endpoint.systemId);
    expect(harness.routeNativeElement!.textContent).toContain('runner.authProfile');
  });

  it('sends requests through the existing runner API and displays the response result', async () => {
    const harness = await RouterTestingHarness.create(
      '/workbench/endpoints/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/run'
    );
    const component = harness.routeDebugElement!.componentInstance as EndpointRunnerComponent;
    component.run();
    harness.detectChanges();
    expect(api.runRequest).toHaveBeenCalledWith(jasmine.objectContaining({
      endpointId: endpoint.id,
      routeParams: jasmine.objectContaining({ orderId: '123' }),
      queryParams: jasmine.objectContaining({ expand: 'items' })
    }));
    expect(component.result()?.statusCode).toBe(201);
    expect(api.getRequestHistory).not.toHaveBeenCalled();
    expect(harness.routeNativeElement!.textContent).toContain('201');
  });

  it('keeps the existing mock simulation local and makes its non-network state explicit', async () => {
    const harness = await RouterTestingHarness.create(
      '/workbench/endpoints/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/run'
    );
    const component = harness.routeDebugElement!.componentInstance as EndpointRunnerComponent;
    component.toggleMockMode();
    harness.detectChanges();
    expect(api.runRequest).not.toHaveBeenCalled();
    expect(component.isMockResult()).toBeTrue();
    expect(harness.routeNativeElement!.textContent).toContain('runner.mockNoNetwork');
  });

  it('shows backend forbidden errors instead of rendering an empty response as success', async () => {
    api.getEndpoint.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const harness = await RouterTestingHarness.create(
      '/workbench/endpoints/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/run'
    );
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')?.textContent)
      .toContain('org.forbidden');
    expect(harness.routeNativeElement!.querySelector('.request-panel')).toBeNull();
  });

  it('preserves legacy runner route presentation and back-navigation target', async () => {
    const harness = await RouterTestingHarness.create(
      '/endpoints/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/run'
    );
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.workbench-endpoint-header')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.runner-layout.workbench-runner-layout')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('.back-link a')?.getAttribute('href'))
      .toBe('/endpoints/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });
});
