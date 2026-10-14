import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { OrganizationsComponent } from './organizations.component';
import { OrganizationSwitcherComponent } from '../../shared/components/organization-switcher/organization-switcher.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateService } from '../../core/services/translate.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { Organization, OrganizationMember, OrganizationRole } from '../../core/models/organization';
import { testUser, organizationA, organizationB, apiBase, settleAsync } from '../../core/services/organization.fixtures.spec';

const ownerRole: OrganizationRole = { id: 'org-owner-role', name: 'Organization Owner', description: 'Organization role description' };
const memberRole: OrganizationRole = { id: 'org-member-role', name: 'Organization Developer', description: null };
const alice: OrganizationMember = { id: 'membership-1', userId: testUser.userId, username: 'alice',
  fullName: 'Alice Member', role: ownerRole, state: 'Active' };
const bob: OrganizationMember = { id: 'membership-2', userId: 'user-2', username: 'bob',
  fullName: null, role: memberRole, state: 'Active' };

describe('Workbench settings members and access', () => {
  let http: HttpTestingController;
  let context: OrganizationContextService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [OrganizationsComponent, OrganizationSwitcherComponent],
      providers: [provideRouter([
        { path: 'workbench/settings/members', component: OrganizationsComponent },
        { path: 'organizations', component: OrganizationsComponent }
      ]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }]
    }).compileComponents();
    TestBed.inject(AuthService).currentUser.set(testUser);
    context = TestBed.inject(OrganizationContextService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify({ ignoreCancelled: true }); localStorage.clear(); });

  async function initialize(organization: Organization = organizationA, canManageUsers = false, permissions: string[] = []) {
    const initialized = context.initialize(testUser.userId);
    http.expectOne(`${apiBase}/organizations`).flush({ success: true, data: {
      organizations: [organization, organizationB], canManageUsers
    } });
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: { organization, permissions } });
    await initialized;
  }
  async function render(url = '/workbench/settings/members') {
    const harness = await RouterTestingHarness.create(url);
    harness.detectChanges();
    return { harness, element: harness.routeNativeElement!,
      component: harness.routeDebugElement!.componentInstance as OrganizationsComponent };
  }
  function flushDirectory(members = [alice, bob], roles = [ownerRole, memberRole]) {
    const memberRequest = http.expectOne(`${apiBase}/organizations/current/members`);
    const roleRequest = http.expectOne(`${apiBase}/organizations/current/roles`);
    expect(memberRequest.request.headers.get('X-Organization-Id')).toBe(context.activeOrganizationId()!);
    expect(roleRequest.request.headers.get('X-Organization-Id')).toBe(context.activeOrganizationId()!);
    memberRequest.flush({ success: true, data: members });
    roleRequest.flush({ success: true, data: roles });
  }

  it('renders Workbench organization settings with the member directory and read-only access panels', async () => {
    await initialize();
    const { harness, element } = await render();
    flushDirectory(); harness.detectChanges();
    expect(element.querySelector('.organization-settings')).toBeNull();
    for (const selector of ['.members-header', '.settings-tabs', '.member-table', '.member-detail-panel', '.access-context']) {
      expect(element.querySelector(selector)).withContext(selector).not.toBeNull();
    }
    expect(element.querySelector('input[type="email"]')).toBeNull();
    expect(element.querySelector('.settings-tabs a[href="/organizations"]')).toBeNull();
    expect(element.textContent).toContain('Workspace A');
    expect(element.textContent).not.toContain('SuperAdmin');
    expect(element.querySelector('tbody')?.textContent).toContain(ownerRole.name);
    expect(element.querySelector('.selected-member-heading')?.textContent).toContain(alice.fullName!);
    http.expectNone(req => req.method !== 'GET');
  });

  it('shows real organization details and honest unavailable states without leaving Workbench', async () => {
    await initialize();
    const { harness, element } = await render();
    flushDirectory(); harness.detectChanges();

    (element.querySelector('[data-settings-tab="organization"]') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(element.querySelector('.settings-information')?.textContent).toContain(organizationA.name);
    expect(element.querySelector('.settings-information')?.textContent).toContain(organizationA.type);
    expect(element.querySelector('.settings-information')?.textContent).toContain(organizationA.slug);
    expect(element.querySelector('.settings-information')?.textContent).toContain('org.creationUnsupported');
    expect(element.querySelector('.settings-information')?.querySelector('button')).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/workbench/settings/members');

    (element.querySelector('[data-settings-tab="invitations"]') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(element.querySelector('.invitations-panel')?.textContent).toContain('org.invitationsUnsupported');
    expect(element.querySelector('.invitations-panel')?.textContent).toContain('org.pendingUnsupported');
    expect(element.querySelector('.invitations-panel input, .invitations-panel select, .invitations-panel button')).toBeNull();
    expect(element.querySelector('.members-actions .primary')).toBeNull();
    http.expectNone(req => req.method !== 'GET');
  });

  it('keeps organization details structural-only for Viewer memberships', async () => {
    const viewer = { ...organizationA, name: '[restricted]', membership: { ...organizationA.membership, isReadOnly: true } };
    await initialize(viewer);
    const { harness, element } = await render();
    flushDirectory(); harness.detectChanges();

    (element.querySelector('[data-settings-tab="organization"]') as HTMLButtonElement).click();
    harness.detectChanges();
    const information = element.querySelector('.settings-information')!;
    expect(information.textContent).toContain(viewer.id);
    expect(information.textContent).toContain('org.structuralOnly');
    expect(information.textContent).not.toContain(viewer.name);
    expect(information.querySelector('[data-testid="organization-slug"]')).toBeNull();
    expect(information.textContent).not.toContain(viewer.membership.role.name);
  });

  it('keeps organization settings navigation in RTL without changing its route', async () => {
    await initialize();
    const { harness, element } = await render();
    flushDirectory(); harness.detectChanges();
    const originalDirection = document.documentElement.dir;
    document.documentElement.dir = 'rtl';
    try {
      expect(getComputedStyle(element.querySelector('.members-workspace')!).direction).toBe('rtl');
      const organizationTab = element.querySelector<HTMLButtonElement>('[data-settings-tab="organization"]')!;
      organizationTab.click();
      harness.detectChanges();
      expect(organizationTab.getAttribute('aria-pressed')).toBe('true');
      expect(TestBed.inject(Router).url).toBe('/workbench/settings/members');
    } finally {
      document.documentElement.dir = originalDirection;
    }
  });

  it('retains the legacy organization/discovery/invitation-unavailable composition', async () => {
    await initialize();
    const { harness, element } = await render('/organizations');
    flushDirectory(); harness.detectChanges();
    expect(element.querySelector('.organization-settings')).not.toBeNull();
    expect(element.querySelector('.members-workspace')).toBeNull();
    expect(element.querySelector<HTMLInputElement>('input[type="email"]')?.disabled).toBeTrue();
    expect(element.textContent).toContain('Workspace B');
  });

  it('uses actual member role and state with null full-name and description handling', async () => {
    await initialize();
    const { harness, element, component } = await render();
    flushDirectory(); harness.detectChanges();
    component.selectMember(bob.id); harness.detectChanges();
    expect(element.querySelector('.selected-member-heading')?.textContent).toContain('bob');
    expect(element.querySelector('.member-detail-panel')?.textContent).toContain(memberRole.name);
    expect(element.querySelector('.member-detail-panel')?.textContent).toContain('Active');
    expect(element.textContent).not.toContain('undefined');
    expect(component.members()[1].fullName).toBeNull();
    expect(component.members()[1].role.description).toBeNull();
  });

  it('searches returned data without backend-contract changes and clears hidden selection', async () => {
    await initialize();
    const { harness, element, component } = await render();
    flushDirectory(); harness.detectChanges();
    component.setSearch('BOB'); harness.detectChanges();
    expect(component.filteredMembers()).toEqual([bob]);
    expect(component.selectedMember()?.id).toBe(bob.id);
    expect(element.querySelectorAll('tbody tr').length).toBe(1);
    component.setSearch('Organization Owner'); harness.detectChanges();
    expect(component.filteredMembers()).toEqual([alice]);
    http.expectNone(`${apiBase}/organizations/current/members`);
  });

  it('wires search input and role filter controls, including clearing the search', async () => {
    await initialize();
    const { harness, element, component } = await render();
    flushDirectory(); harness.detectChanges();
    const search = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'no-matching-member';
    search.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(component.filteredMembers()).toEqual([]);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    harness.detectChanges();
    expect(component.filteredMembers().length).toBe(2);
    const select = element.querySelector<HTMLSelectElement>('.member-filter select')!;
    select.value = memberRole.id;
    select.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(component.filteredMembers()).toEqual([bob]);
  });

  it('filters by organization role ID rather than JWT or legacy role names', async () => {
    await initialize();
    const { harness, component } = await render();
    flushDirectory(); harness.detectChanges();
    component.setRoleFilter(memberRole.id);
    expect(component.filteredMembers()).toEqual([bob]);
    expect(component.selectedMember()?.role.id).toBe(memberRole.id);
  });

  it('selects another member through the table without a network or mutation request', async () => {
    await initialize();
    const { harness, element, component } = await render();
    flushDirectory(); harness.detectChanges();
    (element.querySelectorAll('.member-select')[1] as HTMLButtonElement).click();
    harness.detectChanges();
    expect(component.selectedId()).toBe(bob.id);
    expect(element.querySelector('.selected-member-heading')?.textContent).toContain('bob');
    http.expectNone(req => req.method !== 'GET');
  });

  it('shows a read-only role catalogue without inventing other members permissions', async () => {
    await initialize();
    const { harness, element, component } = await render();
    flushDirectory(); component.activeTab = 'roles'; harness.detectChanges();
    expect(element.querySelector('.roles-directory')?.textContent).toContain(ownerRole.description!);
    expect(element.querySelector('.roles-directory')?.textContent).toContain('members.notProvided');
    expect(element.querySelector('.member-detail-layout')).toBeNull();
    expect(element.textContent).not.toContain('users.manage');
  });

  it('paginates the loaded directory and resets page and selection on filters', async () => {
    await initialize();
    const { harness, component } = await render();
    const members = Array.from({ length: 23 }, (_, i) => ({ ...alice, id: `membership-${i}`, username: `person-${i}`, fullName: `Person ${i}` }));
    flushDirectory(members); harness.detectChanges();
    expect(component.totalPages()).toBe(3);
    expect(component.pagedMembers().length).toBe(10);
    component.changePage(1);
    expect(component.page()).toBe(2);
    expect(component.selectedId()).toBe('membership-10');
    component.changePage(1);
    expect(component.pagedMembers().length).toBe(3);
    component.setSearch('person-22');
    expect(component.page()).toBe(1);
    expect(component.selectedId()).toBe('membership-22');
    expect(component.totalPages()).toBe(1);
  });

  it('uses only returned counts instead of pending invitations or MFA metrics', async () => {
    await initialize();
    const { harness, element, component } = await render();
    flushDirectory(); harness.detectChanges();
    expect(component.activeMemberCount()).toBe(2);
    const values = [...element.querySelectorAll('.membership-strip strong')].map(el => el.textContent?.trim());
    expect(values.slice(0, 3)).toEqual(['2', '2', '2']);
    expect(element.textContent).not.toContain('MFA');
    expect(element.textContent).not.toContain('Last active');
  });

  it('renders structural IDs and suppresses protected names, usernames and descriptions for Viewer', async () => {
    const viewer = { ...organizationA, name: '[restricted]', membership: { ...organizationA.membership, isReadOnly: true } };
    await initialize(viewer);
    const { harness, element, component } = await render();
    flushDirectory(); harness.detectChanges();
    expect(element.querySelector('input[type="search"]')).toBeNull();
    expect(element.textContent).toContain(alice.userId);
    expect(element.textContent).toContain(ownerRole.id);
    for (const text of [alice.fullName!, alice.username, bob.username, ownerRole.name, ownerRole.description!, memberRole.name]) {
      expect(element.textContent).not.toContain(text);
    }
    component.setSearch('secret');
    expect(component.filteredMembers().length).toBe(2);
    component.activeTab = 'roles'; harness.detectChanges();
    expect(element.textContent).not.toContain(ownerRole.description!);
    expect(element.textContent).toContain('org.structuralOnly');
  });

  for (const role of ['Owner', 'Admin', 'Developer', 'Viewer']) {
    it(`keeps invitation and membership mutations unavailable for ${role}, including platform users.manage`, async () => {
      const org = { ...organizationA, membership: { ...organizationA.membership, isReadOnly: role === 'Viewer',
        role: { id: `${role}-role`, name: role, description: null } } };
      await initialize(org, true, ['users.manage', 'teams.manage']);
      const { harness, element } = await render();
      flushDirectory(); harness.detectChanges();
      const invite = element.querySelector<HTMLButtonElement>('.members-actions .primary');
      expect(invite).toBeNull();
      const menu = element.querySelector('details')!;
      menu.open = true; harness.detectChanges();
      expect(menu.querySelectorAll('button:disabled').length).toBe(2);
      expect(element.textContent).toContain('org.invitationsUnsupported');
      expect(element.textContent).toContain('org.memberActionsUnsupported');
      (element.querySelector('[data-settings-tab="invitations"]') as HTMLButtonElement).click();
      harness.detectChanges();
      expect(element.querySelector('.invitations-panel input, .invitations-panel select, .invitations-panel button')).toBeNull();
      http.expectNone(req => req.method !== 'GET');
      http.expectNone(req => req.url.includes('/invitations'));
    });
  }

  it('renders loading before reads and does not confuse it with an empty directory', async () => {
    await initialize();
    const { element } = await render();
    expect(element.querySelector('[role="status"]')?.textContent).toContain('members.loading');
    expect(element.textContent).not.toContain('members.emptyHint');
    flushDirectory();
  });

  it('renders honest empty member/role states without fake invitation records', async () => {
    await initialize();
    const { harness, element, component } = await render();
    flushDirectory([], []); harness.detectChanges();
    expect(element.textContent).toContain('members.empty');
    expect(component.selectedMember()).toBeNull();
    expect(element.textContent).toContain('members.selectPrompt');
    component.activeTab = 'roles'; harness.detectChanges();
    expect(element.textContent).toContain('members.noRoles');
  });

  it('shows no matches separately from an empty organization directory', async () => {
    await initialize();
    const { harness, element, component } = await render();
    flushDirectory(); component.setSearch('not-a-person'); harness.detectChanges();
    expect(element.textContent).toContain('members.noMatches');
    expect(element.textContent).not.toContain('members.emptyHint');
    expect(element.querySelector('.selected-member-heading')).toBeNull();
  });

  for (const status of [403, 500]) {
    it(`renders an explicit ${status} directory error without stale rows`, async () => {
      await initialize();
      const { harness, element } = await render();
      http.expectOne(`${apiBase}/organizations/current/members`).flush({}, { status, statusText: 'Read failure' });
      for (const request of http.match(`${apiBase}/organizations/current/roles`)) {
        if (!request.cancelled) request.flush({ success: true, data: [] });
      }
      harness.detectChanges();
      expect(element.querySelector('[role="alert"]')?.textContent).toContain(status === 403 ? 'org.forbidden' : 'org.requestFailed');
      expect(element.querySelector('tbody')).toBeNull();
      for (const request of http.match(`${apiBase}/organizations/current`)) {
        request.flush({ success: true, data: { organization: organizationA, permissions: [] } });
      }
      await settleAsync();
    });
  }

  it('does not treat unsuccessful directory responses as successful empty reads', async () => {
    await initialize();
    const { harness, element } = await render();
    http.expectOne(`${apiBase}/organizations/current/members`).flush({ success: false });
    http.expectOne(`${apiBase}/organizations/current/roles`).flush({ success: true, data: [] });
    harness.detectChanges();
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.textContent).not.toContain('members.emptyHint');
  });

  it('clears members, roles, search, selection and role tab immediately on organization switching', async () => {
    await initialize();
    const { harness, component, element } = await render();
    flushDirectory(); harness.detectChanges();
    component.setSearch('alice'); component.setRoleFilter(ownerRole.id); component.activeTab = 'roles';
    const switched = context.selectOrganization(organizationB.id);
    expect(component.members()).toEqual([]);
    expect(component.roles()).toEqual([]);
    expect(component.selectedId()).toBeNull();
    expect(component.search()).toBe('');
    expect(component.roleFilter()).toBe('');
    expect(component.activeTab).toBe('members');
    harness.detectChanges();
    expect(element.textContent).not.toContain(alice.fullName!);
    http.expectOne(`${apiBase}/organizations/current`).flush({ success: true, data: { organization: organizationB, permissions: [] } });
    await switched;
    flushDirectory([{ ...bob, fullName: 'Workspace B member' }], [memberRole]);
    harness.detectChanges();
    expect(element.textContent).toContain('Workspace B member');
    expect(element.textContent).not.toContain(alice.fullName!);
  });

  it('cancels directory requests on teardown', async () => {
    await initialize();
    const { harness } = await render();
    const request = http.expectOne(`${apiBase}/organizations/current/members`);
    const roles = http.expectOne(`${apiBase}/organizations/current/roles`);
    harness.fixture.destroy();
    expect(request.cancelled).toBeTrue();
    expect(roles.cancelled).toBeTrue();
  });

  it('links the existing context switcher to Workbench settings only in Workbench', async () => {
    await initialize();
    const { harness } = await render();
    flushDirectory(); harness.detectChanges();
    const switcher = TestBed.createComponent(OrganizationSwitcherComponent);
    switcher.detectChanges();
    expect(switcher.nativeElement.querySelector('a').getAttribute('href')).toBe('/workbench/settings/members');
    await harness.navigateByUrl('/organizations');
    flushDirectory(); harness.detectChanges(); switcher.detectChanges();
    expect(switcher.nativeElement.querySelector('a').getAttribute('href')).toBe('/organizations');
  });
});
