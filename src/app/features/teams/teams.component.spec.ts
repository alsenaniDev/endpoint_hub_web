import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { TranslateService } from '../../core/services/translate.service';
import { ApiResponse, PagedResult, Team } from '../../core/models/models';
import { TeamsComponent } from './teams.component';

const team: Team = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Platform Engineering',
  description: 'Owns platform services',
  contactEmail: 'platform@example.test',
  slackChannel: '#platform',
  systemCount: 4,
  createdAt: '2026-09-01T12:00:00Z'
};

function teamPage(items: Team[] = [team], totalPages = 1): ApiResponse<PagedResult<Team>> {
  return {
    success: true,
    data: {
      items,
      totalCount: items.length === 1 ? 21 : items.length,
      pageNumber: 1,
      pageSize: 20,
      totalPages,
      hasNextPage: totalPages > 1,
      hasPreviousPage: false
    } as PagedResult<Team>
  };
}

describe('TeamsComponent Workbench presentation', () => {
  let api: jasmine.SpyObj<ApiService>;
  let auth: { hasPermission: jasmine.Spy };
  let organization: {
    structuralOnly: ReturnType<typeof signal<boolean>>;
    canMutate: ReturnType<typeof signal<boolean>>;
    activeOrganization: ReturnType<typeof signal<{ id: string; name: string } | null>>;
    requireMutation: jasmine.Spy;
    reportApiError: jasmine.Spy;
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getTeams', 'createTeam', 'updateTeam', 'deleteTeam'
    ]);
    api.getTeams.and.returnValue(of(teamPage()));
    api.createTeam.and.returnValue(of({ success: true, data: team }));
    api.updateTeam.and.returnValue(of({ success: true, data: team }));
    api.deleteTeam.and.returnValue(of({ success: true, data: true }));
    auth = { hasPermission: jasmine.createSpy().and.returnValue(false) };
    const structuralOnly = signal(false);
    const canMutate = signal(true);
    organization = {
      structuralOnly,
      canMutate,
      activeOrganization: signal({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Northstar' }),
      requireMutation: jasmine.createSpy().and.callFake((permission: string) =>
        canMutate() && auth.hasPermission(permission)),
      reportApiError: jasmine.createSpy()
    };

    await TestBed.configureTestingModule({
      imports: [TeamsComponent],
      providers: [
        provideRouter([
          { path: 'workbench/teams', component: TeamsComponent },
          { path: 'teams', component: TeamsComponent }
        ]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: OrganizationContextService, useValue: organization },
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
  });

  it('renders the dense list and available-data summary in Workbench mode', async () => {
    const harness = await RouterTestingHarness.create('/workbench/teams');
    harness.detectChanges();
    const text = harness.routeNativeElement!.textContent ?? '';
    expect(text).toContain('teams.workbench.directory');
    expect(text).toContain('Platform Engineering');
    expect(text).toContain('platform@example.test');
    expect(text).toContain('teams.workbench.systemsOnPage');
    expect(harness.routeNativeElement!.querySelector('.teams-grid')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('table')).not.toBeNull();
  });

  it('retains the legacy card presentation on /teams', async () => {
    const harness = await RouterTestingHarness.create('/teams');
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.teams-grid')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('.workbench-teams')).toBeNull();
    expect(api.getTeams).toHaveBeenCalledWith(undefined, 1, 20);
  });

  it('searches and paginates through the existing paged API', async () => {
    api.getTeams.and.returnValue(of(teamPage([team], 3)));
    const harness = await RouterTestingHarness.create('/workbench/teams');
    const component = harness.routeDebugElement!.componentInstance as TeamsComponent;
    api.getTeams.calls.reset();

    component.searchControl.setValue('platform');
    component.applySearch();
    expect(api.getTeams).toHaveBeenCalledWith('platform', 1, 20);

    component.goToPage(2);
    expect(api.getTeams).toHaveBeenCalledWith('platform', 2, 20);
    expect(component.pageNumber()).toBe(2);
  });

  it('validates and submits create/edit using the existing API and mutation guard', async () => {
    auth.hasPermission.and.returnValue(true);
    const harness = await RouterTestingHarness.create('/workbench/teams');
    const component = harness.routeDebugElement!.componentInstance as TeamsComponent;

    component.openForm();
    component.form.controls.name.setValue('');
    component.submit();
    expect(api.createTeam).not.toHaveBeenCalled();

    component.form.setValue({
      name: 'API Platform',
      description: 'Platform APIs',
      contactEmail: 'valid@example.test',
      slackChannel: '#api-platform'
    });
    component.submit();
    expect(organization.requireMutation).toHaveBeenCalledWith('teams.manage');
    expect(api.createTeam).toHaveBeenCalledWith({
      name: 'API Platform',
      description: 'Platform APIs',
      contactEmail: 'valid@example.test',
      slackChannel: '#api-platform'
    });

    component.openForm(team);
    component.form.controls.contactEmail.setValue('not-an-email');
    component.submit();
    expect(api.updateTeam).not.toHaveBeenCalled();
    component.form.controls.contactEmail.setValue('updated@example.test');
    component.submit();
    expect(api.updateTeam).toHaveBeenCalledWith(team.id, jasmine.objectContaining({
      name: team.name,
      contactEmail: 'updated@example.test'
    }));
  });

  it('requires the existing mutation authorization before opening or confirming delete', async () => {
    const harness = await RouterTestingHarness.create('/workbench/teams');
    const component = harness.routeDebugElement!.componentInstance as TeamsComponent;

    component.openForm();
    component.delete(team.id);
    expect(component.showForm).toBeFalse();
    expect(component.pendingDeleteId()).toBeNull();
    expect(api.deleteTeam).not.toHaveBeenCalled();

    auth.hasPermission.and.returnValue(true);
    component.openForm();
    expect(component.showForm).toBeTrue();
    component.closeForm();
    component.delete(team.id);
    expect(component.pendingDeleteId()).toBe(team.id);
    expect(api.deleteTeam).not.toHaveBeenCalled();
    component.confirmDelete();
    expect(organization.requireMutation).toHaveBeenCalledWith('teams.manage');
    expect(api.deleteTeam).toHaveBeenCalledWith(team.id);
  });

  it('keeps Viewer content structural and does not send free-text search', async () => {
    organization.structuralOnly.set(true);
    const restrictedTeam: Team = {
      ...team,
      name: 'SENSITIVE TEAM NAME',
      description: 'SENSITIVE TEAM DESCRIPTION',
      contactEmail: 'secret@example.test',
      slackChannel: '#secret'
    };
    api.getTeams.and.returnValue(of(teamPage([restrictedTeam])));
    const harness = await RouterTestingHarness.create('/workbench/teams');
    const component = harness.routeDebugElement!.componentInstance as TeamsComponent;
    const text = harness.routeNativeElement!.textContent ?? '';

    expect(text).toContain(team.id);
    expect(text).not.toContain('SENSITIVE TEAM NAME');
    expect(text).not.toContain('SENSITIVE TEAM DESCRIPTION');
    expect(text).not.toContain('secret@example.test');
    expect(harness.routeNativeElement!.querySelector('.team-search')).toBeNull();
    component.searchControl.setValue('SENSITIVE TEAM DESCRIPTION');
    component.applySearch();
    expect(api.getTeams).toHaveBeenCalledWith(undefined, 1, 20);

    component.openForm(restrictedTeam);
    component.submit();
    component.delete(team.id);
    expect(api.createTeam).not.toHaveBeenCalled();
    expect(api.updateTeam).not.toHaveBeenCalled();
    expect(api.deleteTeam).not.toHaveBeenCalled();
  });

  it('renders loading, empty, and explicit backend error states', async () => {
    api.getTeams.and.returnValue(of(teamPage([])));
    const emptyHarness = await RouterTestingHarness.create('/workbench/teams');
    expect(emptyHarness.routeNativeElement!.textContent).toContain('teams.workbench.emptyTitle');

    const component = emptyHarness.routeDebugElement!.componentInstance as TeamsComponent;
    api.getTeams.and.returnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    component.loadTeams();
    emptyHarness.detectChanges();
    expect(emptyHarness.routeNativeElement!.querySelector('[role="alert"]')?.textContent)
      .toContain('org.forbidden');

    const loading = new Subject<ApiResponse<PagedResult<Team>>>();
    api.getTeams.and.returnValue(loading);
    component.loadTeams();
    emptyHarness.detectChanges();
    expect(emptyHarness.routeNativeElement!.querySelector('[aria-label="common.loading"]')).not.toBeNull();
    loading.error(new HttpErrorResponse({ status: 0 }));
  });
});
