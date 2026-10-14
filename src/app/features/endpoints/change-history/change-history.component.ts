import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { ChangeHistoryItem } from '../../../core/models/models';
import { LoadingComponent } from '../../../shared/components/loading/loading.component';
import { JsonViewerComponent } from '../../../shared/components/json-viewer/json-viewer.component';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { OrganizationContextService } from '../../../core/services/organization-context.service';
import { apiErrorKey } from '../../../core/models/organization';

interface DiffRow {
  type: 'added' | 'removed' | 'changed' | 'unchanged';
  key: string;
  prev: string;
  next: string;
}

@Component({
  selector: 'app-change-history',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingComponent, JsonViewerComponent, TranslatePipe],
  templateUrl: './change-history.component.html',
  styleUrls: ['./change-history.component.scss']
})
export class ChangeHistoryComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly structuralOnly = inject(OrganizationContextService).structuralOnly;
  readonly isWorkbench = this.router.url.startsWith('/workbench');
  errorKey = signal<string | null>(null);

  history = signal<ChangeHistoryItem[]>([]);
  loading = signal(true);
  endpointId = '';

  private tabState: Record<string, 'side' | 'prev' | 'new'> = {};
  private rawState: Record<string, boolean> = {};

  get detailRoute(): string[] {
    return this.isWorkbench
      ? ['/workbench/endpoints', this.endpointId]
      : ['/endpoints', this.endpointId];
  }

  ngOnInit(): void {
    if (this.structuralOnly()) { this.loading.set(false); this.errorKey.set('org.structuralOnly'); return; }
    this.endpointId = this.route.snapshot.paramMap.get('id')!;
    this.api.getChangeHistory(this.endpointId).subscribe({
      next: res => { if (res.success && !this.structuralOnly()) this.history.set(res.data?.items ?? []); else this.errorKey.set(apiErrorKey(500)); this.loading.set(false); },
      error: error => { this.errorKey.set(apiErrorKey(error.status ?? 500)); this.loading.set(false); }
    });
  }

  changeIcon(type: string): string {
    switch (type.toLowerCase()) {
      case 'new': return '✦';
      case 'modified': return '✎';
      case 'deleted': return '✕';
      default: return '●';
    }
  }

  activeTab(ch: ChangeHistoryItem): 'side' | 'prev' | 'new' {
    if (this.tabState[ch.id]) return this.tabState[ch.id];
    return ch.previousSnapshot && ch.newSnapshot ? 'side' : ch.newSnapshot ? 'new' : 'prev';
  }

  setTab(ch: ChangeHistoryItem, tab: 'side' | 'prev' | 'new'): void {
    this.tabState = { ...this.tabState, [ch.id]: tab };
  }

  rawOpen(ch: ChangeHistoryItem): boolean {
    return !!this.rawState[ch.id];
  }

  toggleRaw(ch: ChangeHistoryItem): void {
    if (this.structuralOnly()) return;
    this.rawState = { ...this.rawState, [ch.id]: !this.rawState[ch.id] };
  }

  getDiffRows(ch: ChangeHistoryItem): DiffRow[] | null {
    const hasPrev = !!ch.previousSnapshot;
    const hasNext = !!ch.newSnapshot;
    if (!hasPrev && !hasNext) return null;

    // Single snapshot: show all fields as added or removed
    if (!hasPrev && hasNext) {
      try {
        const next = JSON.parse(ch.newSnapshot!);
        return Object.entries(next).map(([key, val]) => ({
          type: 'added' as const, key,
          prev: '', next: this.fmt(val)
        }));
      } catch { return null; }
    }
    if (hasPrev && !hasNext) {
      try {
        const prev = JSON.parse(ch.previousSnapshot!);
        return Object.entries(prev).map(([key, val]) => ({
          type: 'removed' as const, key,
          prev: this.fmt(val), next: ''
        }));
      } catch { return null; }
    }

    // Both snapshots — compute per-field diff, only show changed/added/removed rows
    try {
      const prev = JSON.parse(ch.previousSnapshot!);
      const next = JSON.parse(ch.newSnapshot!);
      const allKeys = [...new Set([...Object.keys(prev), ...Object.keys(next)])];
      const rows: DiffRow[] = [];
      for (const key of allKeys) {
        const inPrev = key in prev, inNext = key in next;
        if (!inPrev && inNext) {
          rows.push({ type: 'added', key, prev: '', next: this.fmt(next[key]) });
        } else if (inPrev && !inNext) {
          rows.push({ type: 'removed', key, prev: this.fmt(prev[key]), next: '' });
        } else if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
          rows.push({ type: 'changed', key, prev: this.fmt(prev[key]), next: this.fmt(next[key]) });
        }
      }
      return rows.length ? rows : null;
    } catch { return null; }
  }

  getHighlights(ch: ChangeHistoryItem, pane: 'prev' | 'new'): Record<string, 'added' | 'removed' | 'changed'> {
    const rows = this.getDiffRows(ch);
    if (!rows) return {};
    const result: Record<string, 'added' | 'removed' | 'changed'> = {};
    for (const row of rows) {
      if (pane === 'prev' && (row.type === 'removed' || row.type === 'changed')) result[row.key] = row.type;
      if (pane === 'new' && (row.type === 'added' || row.type === 'changed')) result[row.key] = row.type;
    }
    return result;
  }

  private fmt(val: unknown): string {
    if (val === null) return 'null';
    if (val === undefined) return '';
    if (typeof val === 'object') {
      const s = JSON.stringify(val);
      return s.length > 80 ? s.slice(0, 77) + '…' : s;
    }
    const s = String(val);
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  }
}
