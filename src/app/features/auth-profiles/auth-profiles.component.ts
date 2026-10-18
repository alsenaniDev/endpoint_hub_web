import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthProfile, SystemDto, AuthProfileType, TestAuthProfileResult } from '../../core/models/models';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { JsonViewerComponent } from '../../shared/components/json-viewer/json-viewer.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

@Component({
  selector: 'app-auth-profiles',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DropdownModule, LoadingComponent, JsonViewerComponent, TranslatePipe],
  templateUrl: './auth-profiles.component.html',
  styleUrls: ['./auth-profiles.component.scss']
})
export class AuthProfilesComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private readonly organization = inject(OrganizationContextService);
  private readonly destroyRef = inject(DestroyRef);
  private fb = inject(FormBuilder);
  readonly canManageProfiles = computed(() =>
    this.organization.canMutate() && this.organization.hasPermission('authprofiles.manage'));


  profiles = signal<AuthProfile[]>([]);
  systems = signal<SystemDto[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = false;
  editingId: string | null = null;
  selectedSystemId = '';

  // Test auth state
  testingId = signal<string | null>(null);
  showTestModal = signal(false);
  testResult = signal<TestAuthProfileResult | null>(null);
  testingProfileName = signal('');
  copiedToken = signal(false);
  private testRequestVersion = 0;

  authTypes: AuthProfileType[] = ['NoAuth', 'BearerToken', 'ApiKey', 'BasicAuth', 'CustomHeader', 'AutoLoginToken'];

  form = this.fb.group({
    systemId: [''],
    name: ['', Validators.required],
    type: ['BearerToken', Validators.required],
    description: [''],
    token: [''],
    apiKeyHeaderName: [''],
    username: [''],
    password: [''],
    customHeaderName: [''],
    customHeaderValue: [''],
    loginUrl: [''],
    loginMethod: ['POST'],
    loginRequestBodyTemplate: [''],
    tokenJsonPath: [''],
    tokenPrefix: ['Bearer'],
    tokenExpirySeconds: [null as number | null],
    isDefault: [false],
    preAuthProfileId: [null as string | null],
    extraHeaders: this.fb.array([]),
    loginQueryParams: this.fb.array([])
  });

  get extraHeadersArray(): FormArray { return this.form.get('extraHeaders') as FormArray; }
  get loginQueryParamsArray(): FormArray { return this.form.get('loginQueryParams') as FormArray; }

  get isGetLogin(): boolean { return this.form.get('loginMethod')?.value === 'GET'; }

  addExtraHeader(): void {
    this.extraHeadersArray.push(this.fb.group({ key: [''], value: [''] }));
  }

  removeExtraHeader(i: number): void {
    this.extraHeadersArray.removeAt(i);
  }

  addLoginQueryParam(): void {
    this.loginQueryParamsArray.push(this.fb.group({ key: [''], value: [''] }));
  }

  removeLoginQueryParam(i: number): void {
    this.loginQueryParamsArray.removeAt(i);
  }

  constructor() {
    this.organization.changes$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.organization.ready()) {
        this.profiles.set([]);
        this.systems.set([]);
        this.closeTestModal();
        this.loading.set(true);
        return;
      }
      this.loadSystems();
      this.loadProfiles();
    });
  }

  ngOnInit(): void {
    this.loadSystems();
    this.loadProfiles();
  }

  private loadSystems(): void {
    this.api.getSystems(undefined, undefined, 1, 100).subscribe({
      next: r => { if (r.success) this.systems.set(r.data?.items ?? []); },
      error: () => this.systems.set([])
    });
  }

  loadProfiles(): void {
    this.loading.set(true);
    this.api.getAuthProfiles(this.selectedSystemId || undefined).subscribe({
      next: r => { if (r.success) this.profiles.set(r.data ?? []); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  onSysFilter(val: string | null): void { this.selectedSystemId = val ?? ''; this.loadProfiles(); }

  openForm(p?: AuthProfile): void {
    if (!this.canManageProfiles()) return;
    this.editingId = p?.id ?? null;
    this.form.reset({
      systemId: p?.systemId ?? '', name: p?.name ?? '', type: p?.type ?? 'BearerToken',
      description: p?.description ?? '', token: '', apiKeyHeaderName: p?.apiKeyHeaderName ?? '',
      username: '', password: '',
      customHeaderName: p?.customHeaderName ?? '', customHeaderValue: '',
      loginUrl: p?.loginUrl ?? '', loginMethod: p?.loginMethod ?? 'POST', loginRequestBodyTemplate: '',
      tokenJsonPath: p?.tokenJsonPath ?? '', tokenPrefix: p?.tokenPrefix ?? 'Bearer',
      tokenExpirySeconds: null, isDefault: p?.isDefault ?? false,
      preAuthProfileId: p?.preAuthProfileId ?? null
    });
    // Populate extra headers from JSON
    while (this.extraHeadersArray.length) this.extraHeadersArray.removeAt(0);
    if (p?.extraHeaders) {
      try {
        const parsed: Record<string, string> = JSON.parse(p.extraHeaders);
        Object.entries(parsed).forEach(([key, value]) => {
          this.extraHeadersArray.push(this.fb.group({ key: [key], value: [value] }));
        });
      } catch { /* ignore */ }
    }
    // Populate login query params (GET) or body template (POST) from loginRequestBodyTemplate
    while (this.loginQueryParamsArray.length) this.loginQueryParamsArray.removeAt(0);
    if (p?.loginMethod === 'GET' && p?.loginRequestBodyTemplate) {
      try {
        const parsed: Record<string, string> = JSON.parse(p.loginRequestBodyTemplate);
        Object.entries(parsed).forEach(([key, value]) => {
          this.loginQueryParamsArray.push(this.fb.group({ key: [key], value: [value] }));
        });
      } catch { /* ignore */ }
    } else if (p?.loginRequestBodyTemplate) {
      this.form.patchValue({ loginRequestBodyTemplate: p.loginRequestBodyTemplate });
    }
    this.showForm = true;
  }

  closeForm(): void { this.showForm = false; }

  submit(): void {
    if (!this.canManageProfiles() || this.form.invalid) return;
    this.saving.set(true);
    const v = this.form.value as any;
    // Serialize extra headers array to JSON
    const extraHeadersObj: Record<string, string> = {};
    (v.extraHeaders as { key: string; value: string }[] ?? []).forEach(h => {
      if (h.key?.trim()) extraHeadersObj[h.key.trim()] = h.value ?? '';
    });
    // For GET login method: serialize query params into loginRequestBodyTemplate as JSON
    let loginRequestBodyTemplate = v.loginRequestBodyTemplate;
    if (v.loginMethod === 'GET') {
      const paramsObj: Record<string, string> = {};
      (v.loginQueryParams as { key: string; value: string }[] ?? []).forEach(p => {
        if (p.key?.trim()) paramsObj[p.key.trim()] = p.value ?? '';
      });
      loginRequestBodyTemplate = Object.keys(paramsObj).length ? JSON.stringify(paramsObj) : null;
    }
    const payload = {
      ...v,
      systemId: v.systemId || null,
      environmentId: v.environmentId || null,
      preAuthProfileId: v.preAuthProfileId || null,
      loginRequestBodyTemplate,
      extraHeaders: Object.keys(extraHeadersObj).length ? JSON.stringify(extraHeadersObj) : null
    };
    const obs = this.editingId ? this.api.updateAuthProfile(this.editingId, payload) : this.api.createAuthProfile(payload);
    obs.subscribe({ next: () => { this.closeForm(); this.loadProfiles(); this.saving.set(false); }, error: () => this.saving.set(false) });
  }

  delete(id: string): void {
    if (!this.canManageProfiles()) return;
    if (!confirm('Delete this auth profile?')) return;
    this.api.deleteAuthProfile(id).subscribe({ next: () => this.loadProfiles() });
  }

  getSystemName(systemId: string): string {
    return this.systems().find(s => s.id === systemId)?.name ?? systemId;
  }

  testAuth(p: AuthProfile): void {
    if (!this.canManageProfiles()) return;
    const requestVersion = ++this.testRequestVersion;
    this.testingId.set(p.id);
    this.testingProfileName.set(p.name);
    this.testResult.set(null);
    this.copiedToken.set(false);
    this.showTestModal.set(true);
    this.api.testAuthProfile(p.id).subscribe({
      next: r => {
        if (requestVersion !== this.testRequestVersion || !this.canManageProfiles()) return;
        this.testResult.set(r.data ?? null);
        this.testingId.set(null);
      },
      error: () => {
        if (requestVersion === this.testRequestVersion) this.testingId.set(null);
      }
    });
  }

  closeTestModal(): void {
    this.testRequestVersion++;
    this.showTestModal.set(false);
    this.testResult.set(null);
    this.testingId.set(null);
    this.copiedToken.set(false);
  }

  copyToken(): void {
    if (!this.canManageProfiles()) return;
    const token = this.testResult()?.extractedToken;
    if (!token) return;
    navigator.clipboard.writeText(token).then(() => {
      this.copiedToken.set(true);
      setTimeout(() => this.copiedToken.set(false), 2000);
    });
  }

  get testHeaderEntries(): { key: string; value: string }[] {
    const headers = this.testResult()?.generatedHeaders ?? {};
    return Object.entries(headers).map(([key, value]) => ({ key, value }));
  }
}
