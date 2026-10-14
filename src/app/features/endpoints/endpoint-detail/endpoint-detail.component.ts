import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { EndpointDetail, AuthProfile } from '../../../core/models/models';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { MethodBadgeComponent } from '../../../shared/components/method-badge/method-badge.component';
import { JsonViewerComponent } from '../../../shared/components/json-viewer/json-viewer.component';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { apiErrorKey } from '../../../core/models/organization';

@Component({
  selector: 'app-endpoint-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, FormsModule, LoadingComponent, MethodBadgeComponent, JsonViewerComponent, TranslatePipe],
  templateUrl: './endpoint-detail.component.html',
  styleUrls: ['./endpoint-detail.component.scss', './endpoint-documentation.scss']
})
export class EndpointDetailComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private organization = inject(OrganizationContextService);
  readonly structuralOnly = this.organization.structuralOnly;
  readonly canEditNotes = computed(() => this.organization.canMutate() && this.auth.hasPermission('endpoints.manage'));
  errorKey = signal<string | null>(null);

  endpoint = signal<EndpointDetail | null>(null);
  loading = signal(true);
  savingNotes = signal(false);
  activeTab = 'endpoints.detail.parameters';
  tabs = ['endpoints.detail.parameters', 'endpoints.detail.headers', 'endpoints.detail.requestBody', 'endpoints.detail.responses', 'endpoints.detail.notes'];
  notesValue = '';
  usedInPages = '';
  @Input() isWorkbench = this.router.url.startsWith('/workbench');
  @Input() embedded = false;
  @Input() compactDocumentation = false;
  @Input() resourceId = '';

  get listRoute(): string {
    return this.isWorkbench ? '/workbench/endpoints' : '/endpoints';
  }

  endpointRoute(suffix?: string): string[] {
    const base = this.isWorkbench ? '/workbench/endpoints' : '/endpoints';
    return suffix ? [base, this.endpoint()?.id ?? '', suffix] : [base, this.endpoint()?.id ?? ''];
  }

  ngOnInit(): void {
    const id = this.resourceId || this.route.snapshot.paramMap.get('id')!;
    this.api.getEndpoint(id).subscribe({
      next: res => {
        if (res.success && res.data) {
          this.endpoint.set(res.data);
          this.notesValue = res.data.notes ?? '';
          this.usedInPages = res.data.usedInPages ?? '';
        } else this.errorKey.set(apiErrorKey(500));
        this.loading.set(false);
      },
      error: error => { this.errorKey.set(apiErrorKey(error.status ?? 500)); this.loading.set(false); }
    });
  }

  saveNotes(): void {
    if (!this.canEditNotes()) return;
    const ep = this.endpoint();
    if (!ep) return;
    this.savingNotes.set(true);
    this.api.updateEndpointNotes(ep.id, this.notesValue, this.usedInPages).subscribe({
      next: res => { if (!res.success) this.errorKey.set(apiErrorKey(500)); this.savingNotes.set(false); },
      error: error => { this.errorKey.set(apiErrorKey(error.status ?? 500)); this.savingNotes.set(false); }
    });
  }
}
