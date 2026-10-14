import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { OrganizationSelectionComponent } from './organization-selection.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TranslateService } from '../../core/services/translate.service';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { testUser, organizationA, organizationB, testContext, apiBase, settleAsync } from '../../core/services/organization.fixtures.spec';

describe('Pre-workspace organization selection', () => {
  let context: OrganizationContextService;
  let http: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [OrganizationSelectionComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
    context = TestBed.inject(OrganizationContextService);
    TestBed.inject(AuthService).currentUser.set(testUser);
    http = TestBed.inject(HttpTestingController);
    const initialized = context.initialize(testUser.userId);
    http.expectOne(`${apiBase}/organizations`).flush({
      success: true,
      data: { organizations: [organizationA, organizationB], canManageUsers: false }
    });
    await settleAsync();
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: testContext(organizationA)
    });
    await initialized;
  });

  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    localStorage.clear();
  });

  it('shows live organizations and membership details, not token role claims or invented counts', () => {
    const fixture = TestBed.createComponent(OrganizationSelectionComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Workspace A');
    expect(text).toContain('Workspace B');
    expect(text).toContain('Organization Owner');
    expect(text).not.toContain('SuperAdmin');
    expect(text).not.toContain('systems');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.organization-row').length).toBe(2);
  });

  it('revalidates the selected membership through the existing organization context', async () => {
    const fixture = TestBed.createComponent(OrganizationSelectionComponent);
    fixture.detectChanges();
    const selection = fixture.componentInstance.selectOrganization(organizationB.id);
    expect(context.ready()).toBeFalse();
    http.expectOne(`${apiBase}/organizations/current`).flush({
      success: true, data: testContext(organizationB)
    });
    await selection;
    expect(context.activeOrganizationId()).toBe(organizationB.id);
    expect(context.membership()?.role.name).toBe('Organization Member');
  });

  it('continues only after the live context is ready and uses its authorized landing path', async () => {
    const fixture = TestBed.createComponent(OrganizationSelectionComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigateByUrl').and.returnValue(Promise.resolve(true));
    await fixture.componentInstance.continueToWorkspace();
    expect(navigate).toHaveBeenCalledWith(context.landingPath());
    context.prepareOrganizationSwitch();
    await fixture.componentInstance.continueToWorkspace();
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
