import { Location } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of } from 'rxjs';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { apiBase } from '../../core/services/organization.fixtures.spec';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { TranslateService } from '../../core/services/translate.service';
import { InvitationAcceptComponent } from './invitation-accept.component';

describe('InvitationAcceptComponent', () => {
  it('posts the token in the body, omits the tenant header, and scrubs the visible URL', async () => {
    const replaceState = jasmine.createSpy('replaceState');
    await TestBed.configureTestingModule({
      imports: [InvitationAcceptComponent],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ token: 'one-time-secret' }) } } },
        { provide: Router, useValue: { url: '/invitations/accept?token=one-time-secret' } },
        { provide: Location, useValue: { replaceState } },
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } },
        { provide: 'AuthService', useValue: { getToken: () => 'test-jwt', logout: jasmine.createSpy('logout') } }
      ]
    }).compileComponents();

    const { AuthService } = await import('../../core/services/auth.service');
    TestBed.overrideProvider(AuthService, { useValue: { getToken: () => 'test-jwt', logout: jasmine.createSpy('logout') } });
    const fixture = TestBed.createComponent(InvitationAcceptComponent);
    fixture.detectChanges();
    expect(replaceState).toHaveBeenCalledWith('/invitations/accept');

    const http = TestBed.inject(HttpTestingController);
    const pending = fixture.componentInstance.accept();
    const request = http.expectOne(`${apiBase}/organization-invitations/accept`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ token: 'one-time-secret' });
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-jwt');
    expect(request.request.headers.has('X-Organization-Id')).toBeFalse();
    expect(request.request.urlWithParams).not.toContain('one-time-secret');
    request.flush({ success: true, data: {
      outcome: 'Joined', organizationId: 'a0000000-0000-4000-8000-000000000001',
      membershipId: 'b0000000-0000-4000-8000-000000000001', roleName: 'Developer'
    } });
    await pending;
    expect(fixture.componentInstance.token()).toBeNull();
    expect(fixture.componentInstance.outcome()).toBe('org.invitationJoined');
    http.verify();
  });
});
