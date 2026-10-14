import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ManagementComponent } from './management.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateService } from '../../core/services/translate.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { apiBase, organizationA, organizationB, settleAsync, testUser } from '../../core/services/organization.fixtures.spec';

describe('Management-only commands without catalogue reads', () => {
  let http: HttpTestingController;
  let context: OrganizationContextService;
  let fixture: ComponentFixture<ManagementComponent>;
  const resourceId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const parentId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ManagementComponent],
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    context = TestBed.inject(OrganizationContextService);
    TestBed.inject(AuthService).currentUser.set(testUser);
  });
  afterEach(() => { http.verify({ ignoreCancelled: true }); localStorage.clear(); });

  async function load(permissions = ['endpoints.manage'], readOnly = false) {
    const organization = { ...organizationA, membership: { ...organizationA.membership, isReadOnly: readOnly } };
    const loading = context.initialize(testUser.userId);
    http.expectOne(`${apiBase}/organizations`).flush({ success: true, data: {
      organizations: [organization, organizationB], canManageUsers: false
    } });
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: { organization, permissions } });
    await loading;
    fixture = TestBed.createComponent(ManagementComponent);
    fixture.detectChanges();
  }

  it('Developer opens a notes-only workspace without any GET dependency', async () => {
    await load();
    expect(fixture.componentInstance.available().map(resource => resource.value)).toEqual(['endpoints']);
    expect(fixture.componentInstance.operations()).toEqual(['notes']);
    expect(fixture.nativeElement.textContent).toContain('management.knownIds');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('management.title');
    expect(fixture.nativeElement.querySelector('textarea[name="notes"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('input[name="name"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.form-actions button')?.textContent).toContain('management.action.notes');
    http.expectNone(request => request.url.startsWith(apiBase));
  });

  it('clearly marks deletion as destructive and requires its explicit confirmation', async () => {
    await load(['teams.manage', 'systems.manage', 'environments.manage', 'endpoints.manage']);
    const component = fixture.componentInstance;
    component.selectResource('systems');
    component.selectOperation('delete');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.command-intent')?.classList.contains('destructive')).toBeTrue();
    expect(element.querySelector('.confirmation.destructive')?.textContent).toContain('management.confirmDelete');
    expect(element.querySelector('.confirmation input[required]')).toBeTruthy();
    expect(element.querySelector('.form-actions button.delete-action')?.textContent).toContain('management.action.delete');
    expect(element.querySelector('input[name="name"]')).toBeNull();
    http.expectNone(request => request.url.startsWith(apiBase));
  });

  it('Developer PATCHes only explicit notes fields using the active organization', async () => {
    await load();
    const component = fixture.componentInstance;
    component.id = resourceId;
    component.notes = 'Explicit replacement';
    component.usedInPages = 'Explicit page usage';
    component.acknowledged = true;
    component.submit();
    const request = http.expectOne(`${apiBase}/endpoints/${resourceId}/notes`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.headers.get('X-Organization-Id')).toBe(organizationA.id);
    expect(request.request.body).toEqual({ notes: 'Explicit replacement', usedInPages: 'Explicit page usage' });
    request.flush({ success: true, data: true });
    fixture.detectChanges();
    expect(component.success()).toBe('management.saved');
    expect(component.notes).toBe('');
    expect(component.acknowledged).toBeFalse();
    http.expectNone(request => request.method === 'GET');
  });

  it('requires explicit replacement acknowledgement and rejects invalid IDs without sending', async () => {
    await load();
    const component = fixture.componentInstance;
    component.id = resourceId;
    component.submit();
    expect(component.error()).toBe('management.invalid');
    component.acknowledged = true;
    component.id = 'invalid';
    component.submit();
    expect(component.error()).toBe('management.invalid');
    http.expectNone(request => request.url.startsWith(apiBase));
  });

  it('does not allow Developer resource selection to authorize team management', async () => {
    await load();
    fixture.componentInstance.selectResource('teams');
    expect(fixture.componentInstance.error()).toBe('org.forbidden');
    expect(fixture.componentInstance.resource()).toBe('endpoints');
    http.expectNone(request => request.url.startsWith(apiBase));
  });

  it('does not present or send management commands for structural-only membership', async () => {
    await load(['endpoints.manage'], true);
    fixture.componentInstance.id = resourceId;
    fixture.componentInstance.acknowledged = true;
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.componentInstance.error()).toBe('org.forbidden');
    http.expectNone(request => request.url.startsWith(apiBase));
  });

  for (const resource of ['teams', 'systems', 'environments', 'sources'] as const) {
    for (const operation of ['create', 'replace', 'delete'] as const) {
      it(`Admin ${operation} ${resource} uses only the existing write contract`, async () => {
        await load(['teams.manage', 'systems.manage', 'environments.manage', 'endpoints.manage']);
        const component = fixture.componentInstance;
        component.selectResource(resource);
        component.selectOperation(operation);
        component.id = resourceId;
        component.parentId = parentId;
        component.name = 'User-supplied value';
        component.ownerName = 'User-supplied owner';
        component.baseUrl = 'https://example.invalid';
        component.swaggerUrl = 'https://example.invalid/swagger.json';
        component.active = false;
        component.acknowledged = operation !== 'create';
        component.submit();
        const base = resource === 'sources' ? `${apiBase}/environments/${parentId}/swagger-sources` : `${apiBase}/${resource}`;
        const request = http.expectOne(operation === 'create' ? base : `${base}/${resourceId}`);
        expect(request.request.method).toBe(operation === 'create' ? 'POST' : operation === 'replace' ? 'PUT' : 'DELETE');
        expect(request.request.headers.get('X-Organization-Id')).toBe(organizationA.id);
        if (operation !== 'delete' && (resource === 'environments' || resource === 'sources')) {
          expect(request.request.body.isActive).toBeFalse();
        }
        if (operation === 'replace' && resource === 'environments') {
          expect(request.request.body.systemId).toBeUndefined();
        }
        request.flush({ success: true, data: operation === 'delete' ? true : { id: resourceId } });
        expect(component.success()).toBe('management.saved');
        expect(component.resultId()).toBe(resourceId);
        http.expectNone(request => request.method === 'GET');
        http.expectNone(request => request.url.includes('/sync') || request.url.includes('/auth-profile'));
      });
    }
  }

  it('shows backend 403 explicitly, refreshes membership once and never retries the command', async () => {
    await load();
    const component = fixture.componentInstance;
    component.id = resourceId;
    component.acknowledged = true;
    component.submit();
    http.expectOne(`${apiBase}/endpoints/${resourceId}/notes`).flush({}, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('org.forbidden');
    expect(component.success()).toBeNull();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: {
      organization: organizationA, permissions: ['endpoints.manage']
    } });
    await settleAsync();
    http.expectNone(`${apiBase}/endpoints/${resourceId}/notes`);
  });

  it('updates an environment with an optional empty base URL without implying parent reassignment', async () => {
    await load(['environments.manage']);
    const component = fixture.componentInstance;
    component.selectResource('environments');
    component.selectOperation('replace');
    component.id = resourceId;
    component.name = 'Explicit name';
    component.active = false;
    component.acknowledged = true;
    component.submit();
    const request = http.expectOne(`${apiBase}/environments/${resourceId}`);
    expect(request.request.body.systemId).toBeUndefined();
    expect(request.request.body.baseUrl).toBe('');
    request.flush({ success: true, data: { id: resourceId } });
    expect(component.success()).toBe('management.saved');
  });

  it('shows only a validated created resource ID, not arbitrary content from the command DTO', async () => {
    await load(['teams.manage']);
    const component = fixture.componentInstance;
    component.name = 'User input';
    component.submit();
    http.expectOne(`${apiBase}/teams`).flush({ success: true, data: {
      id: resourceId, name: 'SECRET_RETURNED_CONTENT', description: 'SECRET_RETURNED_CONTENT'
    } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(resourceId);
    expect(fixture.nativeElement.textContent).not.toContain('SECRET_RETURNED_CONTENT');
  });

  it('surfaces a malformed created-ID response rather than rendering arbitrary response text', async () => {
    await load(['teams.manage']);
    const component = fixture.componentInstance;
    component.name = 'User input';
    component.submit();
    http.expectOne(`${apiBase}/teams`).flush({ success: true, data: { id: 'SECRET_RETURNED_CONTENT' } });
    expect(component.resultId()).toBeNull();
    expect(component.success()).toBeNull();
    expect(component.error()).toBe('management.resultUnavailable');
  });

  it('clears entered content and cancels the old command on organization switching', async () => {
    await load();
    const component = fixture.componentInstance;
    component.id = resourceId;
    component.notes = 'A_PRIVATE_CONTENT';
    component.acknowledged = true;
    component.submit();
    const old = http.expectOne(`${apiBase}/endpoints/${resourceId}/notes`);
    const switching = context.selectOrganization(organizationB.id);
    expect(old.cancelled).toBeTrue();
    fixture.detectChanges();
    expect(component.notes).toBe('');
    expect(component.acknowledged).toBeFalse();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: {
      organization: organizationB, permissions: ['endpoints.manage']
    } });
    await switching;
    fixture.detectChanges();
    expect(component.id).toBe('');
    expect(component.busy()).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('A_PRIVATE_CONTENT');
    http.expectNone(request => request.method === 'GET' && !request.url.includes('/organizations'));
  });
});
