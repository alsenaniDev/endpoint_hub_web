import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { DropdownModule } from 'primeng/dropdown';
import { JsonViewerComponent } from '../../shared/components/json-viewer/json-viewer.component';
import { ApiService } from '../../core/services/api.service';
import { EmbeddedSavedTest, AuthProfile } from '../../core/models/models';
import { AuthService } from '../../core/services/auth.service';

const HMAC_SECRET = '7jdy3$0AG+C7*EBGwV6hM"Nj03i~-Z';

function jsonValidator(control: AbstractControl): ValidationErrors | null {
  const val = (control.value ?? '').trim();
  if (!val) return null;
  try { JSON.parse(val); return null; } catch { return { invalidJson: true }; }
}

@Component({
  selector: 'app-embedded-test',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TranslatePipe, DropdownModule, JsonViewerComponent],
  templateUrl: './embedded-test.component.html',
  styleUrls: ['./embedded-test.component.scss']
})
export class EmbeddedTestComponent implements OnInit {
  private fb         = inject(FormBuilder);
  private apiService = inject(ApiService);
  readonly auth = inject(AuthService);

  methodOptions = [
    { label: 'GET',    value: 'GET'    },
    { label: 'POST',   value: 'POST'   },
    { label: 'PUT',    value: 'PUT'    },
    { label: 'PATCH',  value: 'PATCH'  },
    { label: 'DELETE', value: 'DELETE' },
  ];

  form = this.fb.group({
    method: ['GET',  [Validators.required]],
    url:    ['',     [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    token:  ['',     [Validators.required]],
    body:   ['',     []],
  });

  running         = signal(false);
  responseStatus  = signal<number | null>(null);
  responseBody    = signal<string | null>(null);
  responseError   = signal<string | null>(null);
  hasResult       = signal(false);
  hasBody         = signal(false);

  // ── Saved tests ────────────────────────────────────────────────
  savedTests    = signal<EmbeddedSavedTest[]>([]);
  testsLoading  = signal(true);
  savingName    = signal(false);
  savingApi     = signal(false);
  saveNameValue = signal('');
  editingTestId = signal<string | null>(null);

  // ── Get Token panel ───────────────────────────────────────────
  tokenPanelOpen    = signal(false);
  authProfiles      = signal<AuthProfile[]>([]);
  profilesLoading   = signal(false);
  selectedProfileId = signal<string | null>(null);
  tokenMethod       = signal('POST');
  tokenUrl          = signal('');
  tokenBodyParams   = signal<Array<{key: string; value: string}>>([
    { key: 'appId', value: '' },
    { key: 'nationalId', value: '' },
  ]);
  tokenJsonPath     = signal('token');
  fetchingToken     = signal(false);
  fetchedToken      = signal<string | null>(null);
  fetchTokenStatus  = signal<number | null>(null);
  fetchTokenError   = signal<string | null>(null);
  requestUsePrefix  = signal(true);

  get tokenHasBody(): boolean {
    const m = this.tokenMethod();
    return m === 'POST' || m === 'PUT' || m === 'PATCH';
  }

  ngOnInit(): void {
    this.apiService.getEmbeddedTests().subscribe({
      next: res => {
        this.savedTests.set(res.data ?? []);
        this.testsLoading.set(false);
      },
      error: () => this.testsLoading.set(false),
    });
  }

  addTokenBodyParam(): void {
    this.tokenBodyParams.update(p => [...p, { key: '', value: '' }]);
  }

  removeTokenBodyParam(i: number): void {
    this.tokenBodyParams.update(p => p.filter((_, idx) => idx !== i));
  }

  updateTokenBodyParamKey(i: number, key: string): void {
    this.tokenBodyParams.update(p => p.map((row, idx) => idx === i ? { ...row, key } : row));
  }

  updateTokenBodyParamValue(i: number, value: string): void {
    this.tokenBodyParams.update(p => p.map((row, idx) => idx === i ? { ...row, value } : row));
  }

  trackParamByIndex(index: number): number {
    return index;
  }

  private parseParamValue(v: string): any {
    const trimmed = v.trim();
    if (trimmed === '') return '';
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    const n = Number(trimmed);
    return !isNaN(n) && trimmed !== '' ? n : v;
  }

  // ── Get Token ─────────────────────────────────────────────────
  toggleTokenPanel(): void {
    const open = !this.tokenPanelOpen();
    this.tokenPanelOpen.set(open);
    if (open && this.auth.hasPermission('authprofiles.view') && this.authProfiles().length === 0 && !this.profilesLoading()) {
      this.profilesLoading.set(true);
      this.apiService.getAuthProfiles().subscribe({
        next: res => { this.authProfiles.set(res.data ?? []); this.profilesLoading.set(false); },
        error: ()  => this.profilesLoading.set(false),
      });
    }
  }

  async fetchToken(): Promise<void> {
    const profileId = this.selectedProfileId();
    const url = this.tokenUrl().trim();
    if (!profileId || !url) return;

    this.fetchingToken.set(true);
    this.fetchedToken.set(null);
    this.fetchTokenError.set(null);
    this.fetchTokenStatus.set(null);

    this.apiService.testAuthProfile(profileId).subscribe({
      next: async (res) => {
        if (!res.data?.isSuccess) {
          this.fetchTokenError.set(res.data?.error ?? 'Failed to resolve auth profile');
          this.fetchingToken.set(false);
          return;
        }
        const authHeader = res.data.generatedHeaders?.['Authorization']
                        ?? res.data.generatedHeaders?.['authorization'];
        // Use the full Authorization header value as-is (respects the profile's prefix, or no prefix)
        const authHeaderValue = authHeader ?? res.data.extractedToken ?? '';
        const method = this.tokenMethod();
        // Build JSON body from key-value params
        const paramsArr = this.tokenBodyParams();
        const bodyObj: Record<string, any> = {};
        paramsArr.forEach(p => { if (p.key.trim()) bodyObj[p.key.trim()] = this.parseParamValue(p.value); });
        const body = Object.keys(bodyObj).length ? JSON.stringify(bodyObj) : '';
        try {
          const init: RequestInit = {
            method,
            headers: { 'Authorization': authHeaderValue, 'Content-Type': 'application/json' },
          };
          if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && body) {
            init.body = body;
          }
          const response = await fetch(url, init);
          const text = await response.text();
          this.fetchTokenStatus.set(response.status);
          const extracted = this.extractTokenFromResponse(text, this.tokenJsonPath().trim());
          if (extracted) {
            this.fetchedToken.set(extracted);
          } else {
            this.fetchTokenError.set(`Status ${response.status} — Could not extract token. Specify a JSON path (e.g. data.token).`);
          }
        } catch (err: any) {
          this.fetchTokenError.set(err?.message ?? 'Network request failed');
        } finally {
          this.fetchingToken.set(false);
        }
      },
      error: () => {
        this.fetchTokenError.set('Failed to resolve auth profile');
        this.fetchingToken.set(false);
      },
    });
  }

  applyFetchedToken(): void {
    const t = this.fetchedToken();
    if (t) { this.form.patchValue({ token: t }); }
  }

  private extractTokenFromResponse(body: string, jsonPath: string): string | null {
    // If body is a plain JWT-like string (no braces)
    const trimmed = body.trim();
    if (!trimmed.includes('{') && !trimmed.includes('<') && trimmed.length > 20) {
      return trimmed;
    }
    try {
      const json = JSON.parse(trimmed);
      if (jsonPath) {
        const val = jsonPath.split('.').reduce((obj: any, key) => obj?.[key], json);
        return val ? String(val) : null;
      }
      // Auto-detect common token field names
      const candidates = ['token', 'access_token', 'accessToken', 'bearerToken', 'bearer_token', 'id_token'];
      for (const key of candidates) {
        if (json[key]) return String(json[key]);
        if (json.data?.[key]) return String(json.data[key]);
        if (json.result?.[key]) return String(json.result[key]);
      }
      return null;
    } catch {
      return null;
    }
  }
  // ───────────────────────────────────────────────────────────────

  startSave(): void {
    this.editingTestId.set(null);
    this.saveNameValue.set('');
    this.savingName.set(true);
  }

  cancelSave(): void {
    this.savingName.set(false);
    this.editingTestId.set(null);
  }

  startEdit(test: EmbeddedSavedTest): void {
    this.loadTest(test);
    this.editingTestId.set(test.id);
    this.saveNameValue.set(test.name);
    this.savingName.set(true);
  }

  confirmSave(): void {
    const name = this.saveNameValue().trim();
    if (!name) return;
    const { method, url, token, body } = this.form.getRawValue();
    const payload = {
      name,
      method: method ?? 'GET',
      url: url ?? '',
      token: token ?? '',
      body: body ?? undefined,
    };
    const editingId = this.editingTestId();

    this.savingApi.set(true);
    const request$ = editingId
      ? this.apiService.updateEmbeddedTest(editingId, payload)
      : this.apiService.saveEmbeddedTest(payload);

    request$.subscribe({
      next: res => {
        if (res.data) {
          if (editingId) {
            this.savedTests.update(tests => tests.map(t => t.id === editingId ? res.data! : t));
          } else {
            this.savedTests.update(tests => [res.data!, ...tests]);
          }
        }
        this.savingName.set(false);
        this.editingTestId.set(null);
        this.savingApi.set(false);
      },
      error: () => this.savingApi.set(false),
    });
  }

  loadTest(test: EmbeddedSavedTest): void {
    this.form.patchValue({ method: test.method, url: test.url, token: test.token, body: test.body ?? '' });
    this.onMethodChange(test.method);
  }

  deleteTest(id: string): void {
    if (!confirm('Delete this saved test?')) return;
    this.apiService.deleteEmbeddedTest(id).subscribe({
      next: () => this.savedTests.update(tests => tests.filter(t => t.id !== id)),
    });
  }
  // ───────────────────────────────────────────────────────────────

  get responseIsSuccess(): boolean {
    const s = this.responseStatus();
    return s !== null && s >= 200 && s < 300;
  }

  get parsedResponseJson(): object | null {
    const b = this.responseBody();
    if (!b) return null;
    try { return JSON.parse(b); } catch { return null; }
  }

  generateMock(): void {
    const raw = (this.form.get('body')?.value ?? '').trim();
    if (!raw) return;
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return; }
    const mock = this.mockValue(parsed);
    this.form.get('body')!.setValue(JSON.stringify(mock, null, 2));
  }

  private mockValue(val: any, key = ''): any {
    if (Array.isArray(val))
      return val.length ? [this.mockValue(val[0])] : [];
    if (val !== null && typeof val === 'object')
      return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, this.mockValue(v, k)]));
    if (typeof val === 'boolean') return Math.random() > 0.5;
    if (typeof val === 'number')  return this.mockNumber(key, val);
    if (typeof val === 'string')  return this.mockString(key, val);
    return val;
  }

  private mockNumber(key: string, original: number): number {
    const k = key.toLowerCase();
    if (k.match(/\bcount|total|qty|quantity\b/)) return Math.floor(Math.random() * 10) + 1;
    if (k.match(/\bage\b/))                      return Math.floor(Math.random() * 40) + 20;
    if (k.match(/price|amount|cost|fee/))         return parseFloat((Math.random() * 999 + 1).toFixed(2));
    if (k.match(/id|mission|country/))            return Math.floor(Math.random() * 1000) + 1;
    // keep the same integer/float shape
    return Number.isInteger(original)
      ? Math.floor(Math.random() * 9000) + 1000
      : parseFloat((Math.random() * 100).toFixed(4));
  }

  private mockString(key: string, original: string): string {
    const k = key.toLowerCase();
    if (k.match(/email/))                         return 'user@example.com';
    if (k.match(/phone|mobile/))                  return '0501234567';
    if (k.match(/fullname|full_name|name/))        return 'Mohammed';
    if (k.match(/nationalid|national_id/))         return '1' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
    if (k.match(/passport/))                      return 'A' + Math.floor(Math.random() * 90000000 + 10000000);
    if (k.match(/date|time/))                     return new Date(Date.now() + Math.random() * 3.15e10).toISOString();
    if (k.match(/url|link|endpoint/))             return 'https://api.example.com/resource';
    if (k.match(/address/))                       return '123 King Fahd Road';
    if (k.match(/city/))                          return 'Riyadh';
    if (k.match(/country/))                      return 'SA';
    if (k.match(/reason|detail|description|note|condition/)) return 'Sample description text';
    if (k.match(/relationship/))                  return 'Son';
    if (k.match(/code/))                          return 'CODE-' + Math.floor(Math.random() * 9000 + 1000);
    if (k.match(/token|key|secret/))              return 'mock_' + Math.random().toString(36).substring(2, 14);
    if (k.match(/status/))                        return 'active';
    // preserve short strings as-is, replace longer ones
    return original.length <= 4 ? original : 'mock-' + key;
  }

  onMethodChange(method: string): void {
    const bodyCtrl = this.form.get('body')!;
    const needsBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
    this.hasBody.set(needsBody);
    if (needsBody) {
      bodyCtrl.setValidators([jsonValidator]);
    } else {
      bodyCtrl.clearValidators();
      bodyCtrl.setValue('');
    }
    bodyCtrl.updateValueAndValidity();
  }

  async run(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { token, url, method, body } = this.form.getRawValue();

    this.running.set(true);
    this.responseStatus.set(null);
    this.responseBody.set(null);
    this.responseError.set(null);

    try {
      const signed = await this.signRequest(method!, body ?? '');

      const headers: Record<string, string> = {
        'Authorization': this.requestUsePrefix() ? `Bearer ${token}` : `${token}`,
        'Content-Type': 'application/json',
        'signature': signed.signature,
        'timestamp': signed.timestamp,
        'nonce': signed.nonce,
      };

      const init: RequestInit = { method: method!, headers };
      if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && body?.trim()) {
        init.body = body;
      }

      const res = await fetch(url!, init);
      const text = await res.text();

      this.responseStatus.set(res.status);
      this.responseBody.set(text || null);
      this.hasResult.set(true);
    } catch (err: any) {
      this.responseError.set(err?.message ?? 'Request failed');
      this.hasResult.set(true);
    } finally {
      this.running.set(false);
    }
  }

  private async signRequest(method: string, body: string): Promise<{ signature: string; timestamp: string; nonce: string }> {
    const encoder  = new TextEncoder();
    const keyData  = encoder.encode(HMAC_SECRET);
    const timestamp = new Date().toISOString();
    const nonce    = Math.random().toString(36).substring(2);
    // Match backend: non-GET includes body in payload
    const payload  = method.toUpperCase() === 'GET'
      ? `${timestamp}|${nonce}`
      : `${body}|${timestamp}|${nonce}`;
    const data     = encoder.encode(payload);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );

    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, data);
    const signature = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return { signature, timestamp, nonce };
  }
}
