import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { GeneratedCode } from '../../../core/models/models';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { apiErrorKey } from '../../../core/models/organization';

@Component({
  selector: 'app-code-generator',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingComponent, TranslatePipe],
  templateUrl: './code-generator.component.html',
  styleUrls: ['./code-generator.component.scss']
})
export class CodeGeneratorComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly structuralOnly = inject(OrganizationContextService).structuralOnly;
  readonly isWorkbench = this.router.url.startsWith('/workbench');
  errorKey = signal<string | null>(null);

  code = signal<GeneratedCode | null>(null);
  loading = signal(true);
  endpointId = '';

  get detailRoute(): string[] {
    return this.isWorkbench
      ? ['/workbench/endpoints', this.endpointId]
      : ['/endpoints', this.endpointId];
  }

  codeBlocks() {
    const c = this.code();
    if (!c || this.structuralOnly()) return [];
    return [
      { language: 'TypeScript', label: 'Interfaces', code: c.typeScriptInterfaces?.trim() || '' },
      { language: 'Angular', label: 'Service Method', code: c.angularServiceMethod?.trim() || '' }
    ];
  }

  ngOnInit(): void {
    if (this.structuralOnly()) { this.loading.set(false); this.errorKey.set('org.structuralOnly'); return; }
    this.endpointId = this.route.snapshot.paramMap.get('id')!;
    this.api.generateTypeScript(this.endpointId).subscribe({
      next: res => { if (res.success && !this.structuralOnly()) this.code.set(res.data ?? null); else this.errorKey.set(apiErrorKey(500)); this.loading.set(false); },
      error: error => { this.errorKey.set(apiErrorKey(error.status ?? 500)); this.loading.set(false); }
    });
  }

  copy(code: string): void {
    if (this.structuralOnly()) return;
    navigator.clipboard.writeText(code).catch(() => this.errorKey.set(apiErrorKey(500)));
  }
}
