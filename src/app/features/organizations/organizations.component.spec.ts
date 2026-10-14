import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { OrganizationsComponent } from './organizations.component';
import { InvitationAcceptComponent } from './invitation-accept.component';
import { OrganizationSwitcherComponent } from '../../shared/components/organization-switcher/organization-switcher.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateService } from '../../core/services/translate.service';
import { PermissionDirective } from '../../core/directives/permission.directive';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { testUser, organizationA, organizationB, testContext, apiBase, settleAsync } from '../../core/services/organization.fixtures.spec';

@Component({
  standalone: true, imports: [PermissionDirective],
  template: `<button *appPermission="'systems.manage'">Manage systems</button>
    <button *appPermission="'users.manage'">Platform administration</button>`
})
class PermissionTestComponent {}

describe('Organization member/invitation/role UI', () => {
  let context: OrganizationContextService;
  let http: HttpTestingController;
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [OrganizationsComponent, InvitationAcceptComponent, OrganizationSwitcherComponent, PermissionTestComponent],
      providers: [
        provideRouter([{ path: 'workbench/settings/members', component: OrganizationsComponent }]),
        provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
    context = TestBed.inject(OrganizationContextService);
    TestBed.inject(AuthService).currentUser.set(testUser);
    http = TestBed.inject(HttpTestingController);
    const initialized = context.initialize(testUser.userId);
    http.expectOne(`${apiBase}/organizations`).flush({
      success: true, data: { organizations: [organizationA, organizationB], canManageUsers: false }
    });
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: testContext(organizationA) });
    await initialized;
  });
  afterEach(() => { http.verify({ ignoreCancelled: true }); localStorage.clear(); });

  function directory(fullName: string | null = 'Alice Member') {
    const fixture = TestBed.createComponent(OrganizationsComponent);
    fixture.detectChanges();
    http.expectOne(`${apiBase}/organizations/current/members`).flush({
      success: true, data: [{ id: 'member-a', userId: testUser.userId, username: 'alice',
        fullName, role: organizationA.membership.role, state: 'Active' }]
    });
    http.expectOne(`${apiBase}/organizations/current/roles`).flush({
      success: true, data: [organizationA.membership.role]
    });
    fixture.detectChanges();
    return fixture;
  }

  it('renders backend member, membership state and organization role rather than legacy SuperAdmin', () => {
    const fixture = directory();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('tbody')?.textContent).toContain('Alice Member');
    expect(element.querySelector('tbody')?.textContent).toContain('Active');
    expect(element.querySelector('[data-testid="membership-role"]')?.textContent).toContain('Organization Owner');
    expect(element.textContent).not.toContain('SuperAdmin');
    expect(element.textContent).not.toContain(organizationA.id);
  });

  it('renders explicit-null member names and role descriptions without changing stored values', () => {
    const fixture = directory(null);
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('tbody')?.textContent).toContain('alice');
    expect(element.textContent).not.toContain('null');
    expect(element.textContent).not.toContain('undefined');
    expect(fixture.componentInstance.members()[0].fullName).toBeNull();
    expect(fixture.componentInstance.members()[0].role.description).toBeNull();
    expect(fixture.componentInstance.roles()[0].description).toBeNull();
  });

  it('offers Management commands in organization settings only with a usable live management grant', async () => {
    await TestBed.inject(Router).navigateByUrl('/workbench/settings/members');
    const fixture = directory();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[data-settings-tab="management"]')?.getAttribute('href'))
      .toBe('/workbench/settings/management');

    const switched = context.selectOrganization(organizationB.id);
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: { organization: organizationB, permissions: ['endpoints.view'] }
    });
    await switched;
    http.expectOne(`${apiBase}/organizations/current/members`).flush({ success: true, data: [] });
    http.expectOne(`${apiBase}/organizations/current/roles`).flush({ success: true, data: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[data-settings-tab="management"]')).toBeNull();
  });

  it('clears old directory rows synchronously when switching before B is loaded', () => {
    const fixture = directory();
    const switched = context.selectOrganization(organizationB.id);
    expect(fixture.componentInstance.members()).toEqual([]);
    expect(fixture.componentInstance.roles()).toEqual([]);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Alice Member');
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: testContext(organizationB) });
    return switched.then(() => {
      http.expectOne(`${apiBase}/organizations/current/members`).flush({ success: true, data: [] });
      http.expectOne(`${apiBase}/organizations/current/roles`).flush({ success: true, data: [] });
    });
  });

  it('leaves invite/email/role/creation actions disabled and exposes an honest unsupported state', () => {
    const fixture = directory();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector<HTMLInputElement>('input[type="email"]')?.disabled).toBeTrue();
    expect(element.querySelector<HTMLSelectElement>('select')?.disabled).toBeTrue();
    expect(element.textContent).toContain('org.invitationsUnsupported');
    expect(element.textContent).toContain('org.pendingUnsupported');
    const buttons = Array.from(element.querySelectorAll('button'));
    expect(buttons.find(b => b.textContent?.includes('org.create'))?.disabled).toBeTrue();
    expect(buttons.find(b => b.textContent?.includes('org.invite'))?.disabled).toBeTrue();
    http.expectNone(request => request.method !== 'GET');
  });

  it('does not interpret invitation tokens or pretend expired/accepted/invalid outcomes were verified', () => {
    const fixture = TestBed.createComponent(InvitationAcceptComponent);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('org.acceptUnsupported');
    expect(element.textContent).toContain('org.invitationStatesUnsupported');
    http.expectNone(request => request.url.includes('invitation'));
  });

  it('shows current/available organization names and types without exposing IDs as labels', async () => {
    const fixture = TestBed.createComponent(OrganizationSwitcherComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const select = element.querySelector<HTMLSelectElement>('select')!;
    expect(select.value).toBe(organizationA.id);
    expect(element.textContent).toContain('Workspace A');
    expect(element.textContent).toContain('Workspace B');
    expect(element.textContent).toContain('Shared');
    expect(element.textContent).not.toContain(organizationA.id);
  });

  it('centralizes permission visibility and drops actions while context switches', async () => {
    const fixture = TestBed.createComponent(PermissionTestComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Manage systems');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Platform administration');
    const switched = context.selectOrganization(organizationB.id);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Manage systems');
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: { organization: organizationB, permissions: ['endpoints.view'] }
    });
    await switched;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Manage systems');
  });
});
