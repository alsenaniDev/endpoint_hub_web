import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { LoginComponent } from './login.component';
import { TranslateService } from '../../../core/services/translate.service';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { apiBase } from '../../../core/services/organization.fixtures.spec';

describe('Registration has no implicit tenant membership', () => {
  it('does not fetch public teams or submit a tenant TeamId', async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
        { provide: TranslateService, useValue: { t: (key: string) => key, translations$: of({}) } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(LoginComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.componentInstance.switchToRegister();
    fixture.detectChanges();
    http.expectNone(`${apiBase}/teams/public`);
    expect((fixture.nativeElement as HTMLElement).querySelector('[formControlName="teamId"]')).toBeNull();
    fixture.componentInstance.registerForm.setValue({
      username: 'new-member', email: 'member@example.invalid', fullName: '', password: 'test-only-password',
      confirmPassword: 'different-password'
    });
    fixture.componentInstance.register();
    expect(fixture.componentInstance.registerForm.hasError('passwordMismatch')).toBeTrue();
    http.expectNone(`${apiBase}/auth/register`);
    fixture.componentInstance.registerForm.patchValue({ confirmPassword: 'test-only-password' });
    fixture.componentInstance.register();
    const request = http.expectOne(`${apiBase}/auth/register`);
    expect(request.request.body.teamId).toBeUndefined();
    expect(request.request.body.confirmPassword).toBeUndefined();
    expect(request.request.headers.has('X-Organization-Id')).toBeFalse();
    request.flush({ success: false, message: 'Registration not executed by test.' });
    expect(fixture.componentInstance.loading()).toBeFalse();
    expect(fixture.componentInstance.error()).toBe('Registration not executed by test.');

    fixture.componentInstance.switchToLogin();
    fixture.componentInstance.loginForm.setValue({
      usernameOrEmail: 'existing-user', password: 'test-only-password'
    });
    fixture.componentInstance.login();
    const loginRequest = http.expectOne(`${apiBase}/auth/login`);
    expect(loginRequest.request.body).toEqual({ email: 'existing-user', password: 'test-only-password' });
    expect(loginRequest.request.headers.has('X-Organization-Id')).toBeFalse();
    expect(fixture.componentInstance.loading()).toBeTrue();
    loginRequest.flush({ success: false, message: 'Login not executed by test.' });
    expect(fixture.componentInstance.loading()).toBeFalse();
    expect(fixture.componentInstance.error()).toBe('Login not executed by test.');
    http.verify();
    localStorage.clear();
  });
});
