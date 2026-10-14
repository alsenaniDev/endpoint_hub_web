import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { ApiService } from '../../../core/services/api.service';
import { EndpointDetail, AuthProfile, RequestHistoryItem, RunRequestResult } from '../../../core/models/models';
import { AuthService } from '../../../core/services/auth.service';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { MethodBadgeComponent } from '../../../shared/components/method-badge/method-badge.component';
import { JsonViewerComponent } from '../../../shared/components/json-viewer/json-viewer.component';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { apiErrorKey } from '../../../core/models/organization';

@Component({
  selector: 'app-endpoint-runner',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, DropdownModule, LoadingComponent, MethodBadgeComponent, JsonViewerComponent, TranslatePipe],
  templateUrl: './endpoint-runner.component.html',
  styleUrls: ['./endpoint-runner.component.scss', './endpoint-embedded-runner.scss']
})
export class EndpointRunnerComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly auth = inject(AuthService);
  readonly organization = inject(OrganizationContextService);
  @Input() isWorkbench = this.router.url.startsWith('/workbench');
  @Input() embedded = false;
  @Input() resourceId = '';
  readonly errorKey = signal<string | null>(null);

  endpoint = signal<EndpointDetail | null>(null);
  authProfiles = signal<AuthProfile[]>([]);
  result = signal<RunRequestResult | null>(null);
  readonly runHistory = signal<RequestHistoryItem[]>([]);
  readonly historyLoading = signal(false);
  readonly historyError = signal<string | null>(null);
  loading = signal(true);
  running = signal(false);
  mockMode = signal(false);
  isMockResult = signal(false);
  copied = signal(false);
  readonly canViewHistory = computed(() =>
    !this.organization.structuralOnly() &&
    this.organization.canAccessSensitiveContent() &&
    this.auth.hasPermission('endpoints.view')
  );

  endpointId = '';
  selectedAuthProfileId = '';
  baseUrlOverride = '';
  requestBody = '';
  mockResponseBody = '';
  selectedMockStatusCode = '200';

  authProfileOptions = computed(() =>
    this.authProfiles().map(p => ({ label: `${p.name} (${p.type})`, value: p.id }))
  );

  mockStatusOptions = computed(() => {
    const ep = this.endpoint();
    if (!ep) return [{ label: '200 — OK', value: '200' }];
    const opts = ep.responses.map(r => ({
      label: `${r.statusCode}${r.description ? ' — ' + r.description : ''}`,
      value: r.statusCode
    }));
    if (!opts.some(o => o.value === '200')) opts.push({ label: '200 — OK', value: '200' });
    return opts;
  });

  getEnumOptions(p: any): { label: string; value: string }[] | null {
    const vals = this.getParamEnumValues(p);
    return vals ? vals.map((v: string) => ({ label: v, value: v })) : null;
  }
  routeParamValues: Record<string, string> = {};
  queryParamValues: Record<string, string> = {};
  customHeaders: { key: string; value: string }[] = [];

  routeParams = signal<any[]>([]);
  queryParams = signal<any[]>([]);

  ngOnInit(): void {
    this.endpointId = this.resourceId || this.route.snapshot.paramMap.get('id')!;
    this.loading.set(true);
    this.errorKey.set(null);
    this.api.getEndpoint(this.endpointId).subscribe({
      next: res => {
        if (res.success && res.data) {
          this.endpoint.set(res.data);
          const rp = res.data.parameters.filter(p => p.location === 'Path');
          const qp = res.data.parameters.filter(p => p.location === 'Query');
          this.routeParams.set(rp);
          this.queryParams.set(qp);
          rp.forEach(p => { if (!(p.name in this.routeParamValues)) this.routeParamValues[p.name] = p.example ?? ''; });
          qp.forEach(p => { if (!(p.name in this.queryParamValues)) this.queryParamValues[p.name] = p.example ?? ''; });
          if (res.data.systemId && this.auth.hasPermission('authprofiles.view')) {
            this.api.getAuthProfiles(res.data.systemId).subscribe(ap => { if (ap.success) this.authProfiles.set(ap.data ?? []); });
          }
          // Pre-populate request body with schema-derived skeleton
          if (['POST', 'PUT', 'PATCH'].includes(res.data.method)) {
            this.requestBody = this.buildBodyShape(res.data.requestBodies[0]);
          }
          this.mockResponseBody = this.buildMockBody();
          const successRes = res.data.responses.find(r => r.statusCode.startsWith('2'));
          if (successRes) this.selectedMockStatusCode = successRes.statusCode;

          // Pre-populate X-Environment header for develop environments
          if (res.data.environmentName?.toLowerCase().includes('develop')) {
            this.customHeaders.push({ key: 'X-Environment', value: 'dev' });
          }
          if (this.isWorkbench && this.canViewHistory()) this.loadHistory();
        } else {
          this.errorKey.set(apiErrorKey(500));
        }
        this.loading.set(false);
      },
      error: error => {
        this.errorKey.set(apiErrorKey(error.status ?? 500));
        this.loading.set(false);
      }
    });
  }

  get detailRoute(): string[] {
    return this.isWorkbench
      ? ['/workbench/endpoints', this.endpointId]
      : ['/endpoints', this.endpointId];
  }

  backToList(): string {
    return this.isWorkbench ? '/workbench/endpoints' : '/endpoints';
  }

  loadHistory(): void {
    if (!this.isWorkbench || !this.canViewHistory() || !this.endpointId) return;
    this.historyLoading.set(true);
    this.historyError.set(null);
    this.api.getRequestHistory(this.endpointId).subscribe({
      next: response => {
        if (response.success && response.data) {
          this.runHistory.set(response.data.items);
        } else {
          this.runHistory.set([]);
          this.historyError.set(apiErrorKey(500));
        }
        this.historyLoading.set(false);
      },
      error: error => {
        this.runHistory.set([]);
        this.historyError.set(apiErrorKey(error.status ?? 500));
        this.historyLoading.set(false);
      }
    });
  }

  toggleMockMode(): void {
    this.mockMode.set(!this.mockMode());
    if (this.mockMode()) {
      this.mockResponseBody = this.buildMockBody();
      this.runMock();   // auto-show result immediately
    } else {
      this.result.set(null);
      this.isMockResult.set(false);
    }
  }

  regenerateMock(): void {
    this.mockResponseBody = this.buildMockBody(this.selectedMockStatusCode);
    this.runMock();
  }

  onMockStatusChange(code: string): void {
    this.selectedMockStatusCode = code;
    this.mockResponseBody = this.buildMockBody(code);
    this.runMock();
  }

  /** Build a mock response body from example or schema for a given status code */
  buildMockBody(statusCode?: string): string {
    const ep = this.endpoint();
    if (!ep) return '{}';
    const responses = ep.responses ?? [];

    // Try the requested status code first, then first 2xx, then any
    const target = statusCode
      ? responses.find(r => r.statusCode === statusCode)
      : (responses.find(r => r.statusCode.startsWith('2')) ?? responses[0]);

    if (!target) return '{\n  "message": "success"\n}';

    // Use example if present
    if (target.example) {
      try { return JSON.stringify(JSON.parse(target.example), null, 2); } catch { return target.example; }
    }

    // Generate from schema
    if (target.schema) {
      try {
        const schema = JSON.parse(target.schema);
        return JSON.stringify(this.mockFromSchema(schema), null, 2);
      } catch { /* fall through */ }
    }

    return '{\n  "message": "success"\n}';
  }

  private mockFromSchema(node: any): any {
    if (!node) return null;
    if (node.example !== undefined) return node.example;
    if (node.enum?.length) return node.enum[0];
    // allOf / anyOf / oneOf — use first subschema
    const combined = node.allOf ?? node.anyOf ?? node.oneOf;
    if (combined?.length) return this.mockFromSchema({ ...node, ...combined[0], allOf: undefined, anyOf: undefined, oneOf: undefined });

    switch (node.type) {
      case 'object': {
        const obj: Record<string, any> = {};
        if (node.properties)
          for (const [k, v] of Object.entries<any>(node.properties))
            obj[k] = this.mockFromSchema(v);
        return obj;
      }
      case 'array':
        return node.items ? [this.mockFromSchema(node.items)] : [];
      case 'string':
        if (node.format === 'date-time') return new Date().toISOString();
        if (node.format === 'date') return new Date().toISOString().split('T')[0];
        if (node.format === 'uuid') return '00000000-0000-0000-0000-000000000001';
        if (node.format === 'email') return 'user@example.com';
        if (node.format === 'uri') return 'https://example.com';
        return node.title?.toLowerCase().replace(/\s+/g, '-') ?? 'string';
      case 'integer':
      case 'number':
        return node.minimum ?? 1;
      case 'boolean':
        return true;
      case 'null':
        return null;
      default:
        if (node.properties) return this.mockFromSchema({ ...node, type: 'object' });
        if (node.items) return this.mockFromSchema({ ...node, type: 'array' });
        return null;
    }
  }

  hasBody(): boolean { return ['POST', 'PUT', 'PATCH'].includes(this.endpoint()?.method ?? ''); }
  getBodyExample(): string { return this.endpoint()?.requestBodies[0]?.example ?? '{}'; }

  /** Builds a skeleton JSON string from a request body's schema (or example). */
  buildBodyShape(body?: { schema?: string; example?: string }): string {
    if (!body) return '{\n  \n}';
    // Prefer example if available
    if (body.example) {
      try { return JSON.stringify(JSON.parse(body.example), null, 2); } catch { return body.example; }
    }
    if (body.schema) {
      try {
        const schema = JSON.parse(body.schema);
        return JSON.stringify(this.skeletonFromSchema(schema), null, 2);
      } catch { /* fall through */ }
    }
    return '{\n  \n}';
  }

  /** Recursively builds a skeleton object from a JSON Schema node. */
  private skeletonFromSchema(node: any): any {
    if (!node) return null;
    if (node.example !== undefined) return node.example;
    if (node.default !== undefined) return node.default;
    if (node.enum?.length) return node.enum[0];
    const combined = node.allOf ?? node.anyOf ?? node.oneOf;
    if (combined?.length) return this.skeletonFromSchema({ ...node, ...combined[0], allOf: undefined, anyOf: undefined, oneOf: undefined });
    switch (node.type) {
      case 'object': {
        const obj: Record<string, any> = {};
        if (node.properties)
          for (const [k, v] of Object.entries<any>(node.properties))
            obj[k] = this.skeletonFromSchema(v);
        return obj;
      }
      case 'array':
        return node.items ? [this.skeletonFromSchema(node.items)] : [];
      case 'string':
        if (node.format === 'date-time') return new Date().toISOString();
        if (node.format === 'date') return new Date().toISOString().split('T')[0];
        if (node.format === 'uuid') return '00000000-0000-0000-0000-000000000001';
        if (node.format === 'email') return 'user@example.com';
        if (node.format === 'uri') return 'https://example.com';
        return '';
      case 'integer':
      case 'number':
        return node.minimum ?? 0;
      case 'boolean':
        return false;
      case 'null':
        return null;
      default:
        if (node.properties) return this.skeletonFromSchema({ ...node, type: 'object' });
        if (node.items) return this.skeletonFromSchema({ ...node, type: 'array' });
        return null;
    }
  }

  resolvedUrl(): string {
    const ep = this.endpoint();
    if (!ep) return '';
    const base = (this.baseUrlOverride || ep.baseUrl).replace(/\/$/, '');
    let path = ep.path;
    Object.entries(this.routeParamValues).forEach(([k, v]) => {
      if (v) path = path.replace(`{${k}}`, encodeURIComponent(v));
    });
    try {
      const basePath = new URL(base + '/').pathname.replace(/\/$/, '');
      if (basePath && basePath !== '/' && path.toLowerCase().startsWith(basePath.toLowerCase()))
        path = path.slice(basePath.length);
    } catch { /* ignore invalid URL during typing */ }
    if (!path.startsWith('/')) path = '/' + path;
    const qs = Object.entries(this.queryParamValues).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return `${base}${path}${qs ? '?' + qs : ''}`;
  }

  addHeader(): void { this.customHeaders.push({ key: '', value: '' }); }
  removeHeader(i: number): void { this.customHeaders.splice(i, 1); }

  /** Returns enum values for a parameter if its schema defines an enum; null otherwise. */
  getParamEnumValues(p: { schema?: string }): string[] | null {
    if (!p.schema) return null;
    try {
      const schema = JSON.parse(p.schema);
      // Direct enum: { "type": "string", "enum": [...] }
      if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum.map(String);
      // Array with items enum: { "type": "array", "items": { "enum": [...] } }
      if (Array.isArray(schema.items?.enum) && schema.items.enum.length) return schema.items.enum.map(String);
      return null;
    } catch { return null; }
  }

  copyResponse(): void {
    const body = this.result()?.responseBody ?? '';
    navigator.clipboard.writeText(body).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  hasResponseHeaders(): boolean {
    const h = this.result()?.responseHeaders;
    return !!h && Object.keys(h).length > 0;
  }

  run(): void {
    const ep = this.endpoint();
    if (!ep) return;

    if (this.mockMode()) {
      this.runMock();
      return;
    }

    this.running.set(true);
    this.result.set(null);
    this.isMockResult.set(false);

    const customHeadersMap: Record<string, string> = {};
    this.customHeaders.filter(h => h.key).forEach(h => { customHeadersMap[h.key] = h.value; });

    this.api.runRequest({
      endpointId: this.endpointId,
      authProfileId: this.selectedAuthProfileId || undefined,
      routeParams: this.routeParamValues,
      queryParams: this.queryParamValues,
      headers: customHeadersMap,
      body: this.requestBody || undefined,
      baseUrlOverride: this.baseUrlOverride || undefined
    }).subscribe({
      next: res => {
        if (res.success) {
          this.result.set(res.data ?? null);
        } else {
          this.result.set({
            isSuccess: false,
            statusCode: undefined,
            responseHeaders: {},
            responseBody: undefined,
            responseTimeMs: 0,
            error: res.message ?? 'Request failed.'
          });
        }
        if (res.success) this.loadHistory();
        this.running.set(false);
      },
      error: err => {
        const msg = err?.error?.message ?? err?.message ?? 'Network error. Please try again.';
        this.result.set({
          isSuccess: false,
          statusCode: err?.status,
          responseHeaders: {},
          responseBody: undefined,
          responseTimeMs: 0,
          error: msg
        });
        this.running.set(false);
      }
    });
  }

  private runMock(): void {
    const statusCode = parseInt(this.selectedMockStatusCode, 10) || 200;
    const isSuccess = statusCode >= 200 && statusCode < 300;

    // Validate JSON in mock body
    let body = this.mockResponseBody;
    try { body = JSON.stringify(JSON.parse(body), null, 2); } catch { /* keep as-is */ }

    this.result.set({
      isSuccess,
      statusCode,
      responseBody: body,
      responseHeaders: { 'Content-Type': 'application/json', 'X-Mock': 'true' },
      responseTimeMs: 0,
    });
    this.isMockResult.set(true);
  }
}
