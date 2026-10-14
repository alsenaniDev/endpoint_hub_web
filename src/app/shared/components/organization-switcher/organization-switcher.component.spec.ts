import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { OrganizationSwitcherComponent } from './organization-switcher.component';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { TranslateService } from '../../../core/services/translate.service';

describe('OrganizationSwitcherComponent mobile accessibility', () => {
  let fixture: ComponentFixture<OrganizationSwitcherComponent>;
  const organization = {
    id: 'org-long-id',
    name: 'Northstar Commerce International Workspace',
    type: 'Shared',
    membership: { isReadOnly: false }
  };
  const organizationB = {
    id: 'org-b',
    name: 'Workspace B',
    type: 'Shared',
    membership: { isReadOnly: false }
  };
  const activeOrganizationId = signal(organization.id);
  let contextStub: {
    activeOrganizationId: typeof activeOrganizationId;
    activeOrganization: ReturnType<typeof signal<typeof organization>>;
    organizations: ReturnType<typeof signal<typeof organization[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    ready: ReturnType<typeof signal<boolean>>;
    canMutate: ReturnType<typeof signal<boolean>>;
    prepareOrganizationSwitch: jasmine.Spy;
    selectOrganization: jasmine.Spy;
    landingPath: jasmine.Spy;
    hasPermission: jasmine.Spy;
  };

  beforeEach(async () => {
    activeOrganizationId.set(organization.id);
    contextStub = {
      activeOrganizationId,
      activeOrganization: signal(organization),
      organizations: signal([organization, organizationB]),
      loading: signal(false),
      ready: signal(true),
      canMutate: signal(false),
      prepareOrganizationSwitch: jasmine.createSpy('prepareOrganizationSwitch'),
      selectOrganization: jasmine.createSpy('selectOrganization').and.callFake(async (id: string) => {
        activeOrganizationId.set(id);
        return true;
      }),
      landingPath: jasmine.createSpy('landingPath').and.returnValue('/dashboard'),
      hasPermission: jasmine.createSpy('hasPermission').and.callFake((permission: string) => permission === 'teams.view')
    };
    await TestBed.configureTestingModule({
      imports: [OrganizationSwitcherComponent],
      providers: [
        provideRouter([
          { path: 'workbench/systems', component: OrganizationSwitcherComponent },
          { path: 'workbench/settings/members', component: OrganizationSwitcherComponent },
          { path: 'workbench/teams', component: OrganizationSwitcherComponent },
          { path: 'organizations', component: OrganizationSwitcherComponent },
          { path: 'dashboard', component: OrganizationSwitcherComponent }
        ]),
        { provide: OrganizationContextService, useValue: contextStub },
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(OrganizationSwitcherComponent);
    fixture.detectChanges();
  });

  it('ellipsizes the selected organization visually but exposes its full name accessibly', () => {
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(getComputedStyle(select).textOverflow).toBe('ellipsis');
    expect(select.getAttribute('aria-label')).toBe(
      'org.active: Northstar Commerce International Workspace'
    );
    expect(select.title).toBe('Northstar Commerce International Workspace');
    expect(select.selectedOptions[0].textContent).toContain('Northstar Commerce International Workspace');
  });

  it('keeps a Workbench organization switch in the Workbench and uses its permission-aware destination', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/workbench/systems');

    await fixture.componentInstance.switchOrganization(organizationB.id);

    expect(contextStub.prepareOrganizationSwitch).toHaveBeenCalledOnceWith();
    expect(contextStub.selectOrganization).toHaveBeenCalledOnceWith(organizationB.id);
    expect(contextStub.landingPath).not.toHaveBeenCalled();
    expect(router.url).toBe('/workbench/teams');
  });

  it('preserves legacy-shell switching behavior when switching from a legacy route', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/dashboard');

    await fixture.componentInstance.switchOrganization(organizationB.id);

    expect(contextStub.landingPath).toHaveBeenCalledOnceWith();
    expect(router.url).toBe('/dashboard');
  });
});
