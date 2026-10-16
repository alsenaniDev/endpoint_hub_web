import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, ReactiveFormsModule, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { TranslateService } from '../../../core/services/translate.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})

export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private translations = inject(TranslateService);

  mode: 'login' | 'register' = 'login';
  loading = signal(false);
  error = signal('');
  registrationValidationShown = signal(false);

  switchToRegister(): void {
    this.mode = 'register';
    this.error.set('');
    this.registrationValidationShown.set(false);
  }

  switchToLogin(): void {
    this.mode = 'login';
    this.error.set('');
  }

  loginForm = this.fb.nonNullable.group({
    usernameOrEmail: ['', Validators.required],
    password: ['', Validators.required]
  });

  registerForm = this.fb.nonNullable.group({
    username: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    fullName: [''],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', Validators.required]
  }, { validators: passwordsMatch });

  login(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { usernameOrEmail, password } = this.loginForm.getRawValue();
    this.auth.login({ email: usernameOrEmail, password }).subscribe({
      next: result => {
        this.loading.set(false);
        if (result.success && result.data) void this.router.navigateByUrl(this.postLoginUrl());
        else this.error.set(result.message ?? this.translations.t('access.loginFailed'));
      },
      error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? this.translations.t('access.loginFailed')); }
    });
  }

  private postLoginUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // Only restore the expected invitation route. Never accept arbitrary redirect targets.
    return returnUrl && returnUrl.split('?')[0] === '/invitations/accept'
      ? returnUrl
      : '/start';
  }

  register(): void {
    this.registrationValidationShown.set(true);
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { confirmPassword: _confirmPassword, ...payload } = this.registerForm.getRawValue();
    this.auth.register(payload).subscribe({
      next: result => {
        this.loading.set(false);
        if (result.success && result.data) void this.router.navigateByUrl(this.postLoginUrl());
        else this.error.set(result.message ?? this.translations.t('access.registrationFailed'));
      },
      error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? this.translations.t('access.registrationFailed')); }
    });
  }
}

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return confirmPassword && password !== confirmPassword ? { passwordMismatch: true } : null;
}
