import { Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-json-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './json-viewer.component.html',
  styleUrls: ['./json-viewer.component.scss']
})
export class JsonViewerComponent implements OnChanges {
  @Input() content: string | null = null;
  @Input() highlights: Record<string, 'added' | 'removed' | 'changed'> = {};
  private sanitizer = inject(DomSanitizer);
  tree: SafeHtml | null = null;

  ngOnChanges(): void {
    if (!this.content) { this.tree = null; return; }
    try {
      const parsed = JSON.parse(this.content);
      this.tree = this.sanitizer.bypassSecurityTrustHtml(this.renderVal(parsed, 0));
    } catch {
      this.tree = null;
    }
  }

  private renderVal(val: unknown, depth: number, key?: string, last = true, skipHl = false): string {
    if (!skipHl && depth === 1 && key !== undefined && this.highlights[key]) {
      return `<div class="jv-hl-${this.highlights[key]}">${this.renderVal(val, depth, key, last, true)}</div>`;
    }
    const cm = last ? '' : '<span class="jv-cm">,</span>';
    const kh = key !== undefined
      ? `<span class="jv-k">"${this.e(key)}"</span><span class="jv-col">: </span>`
      : '';
    if (val === null) return `<div class="jv-row">${kh}<span class="jv-null">null</span>${cm}</div>`;
    if (typeof val === 'boolean') return `<div class="jv-row">${kh}<span class="jv-b">${val}</span>${cm}</div>`;
    if (typeof val === 'number') return `<div class="jv-row">${kh}<span class="jv-n">${val}</span>${cm}</div>`;
    if (typeof val === 'string') {
      // Auto-expand strings that are themselves valid JSON objects/arrays
      if (val.trimStart().startsWith('{') || val.trimStart().startsWith('[')) {
        try {
          const inner = JSON.parse(val);
          if (typeof inner === 'object' && inner !== null) {
            if (Array.isArray(inner)) return this.renderArr(inner, depth, key, last, true);
            return this.renderObj(inner as Record<string, unknown>, depth, key, last, true);
          }
        } catch { /* fall through to plain string */ }
      }
      return `<div class="jv-row">${kh}<span class="jv-s">"${this.e(val)}"</span>${cm}</div>`;
    }
    if (Array.isArray(val)) return this.renderArr(val, depth, key, last);
    if (typeof val === 'object') return this.renderObj(val as Record<string, unknown>, depth, key, last);
    return `<div class="jv-row">${kh}${this.e(String(val))}${cm}</div>`;
  }

  private renderObj(obj: Record<string, unknown>, depth: number, key?: string, last = true, isJsonStr = false): string {
    const cm = last ? '' : '<span class="jv-cm">,</span>';
    const kh = key !== undefined
      ? `<span class="jv-k">"${this.e(key)}"</span><span class="jv-col">: </span>`
      : '';
    const entries = Object.entries(obj);
    if (entries.length === 0) return `<div class="jv-row">${kh}${isJsonStr ? '<span class="jv-json-str">JSON </span>' : ''}<span class="jv-br">{}</span>${cm}</div>`;

    const inner = entries.map(([k, v], i) => this.renderVal(v, depth + 1, k, i === entries.length - 1)).join('');
    const prev = entries.slice(0, 3).map(([k]) => this.e(k)).join(', ') + (entries.length > 3 ? ', …' : '');
    const tag = isJsonStr ? `<span class="jv-json-str">JSON </span>` : '';

    if (depth === 0) {
      return `<div class="jv-row">${kh}${tag}<span class="jv-br">{</span><div class="jv-body">${inner}</div><span class="jv-br">}</span>${cm}</div>`;
    }
    return `<details open><summary>${kh}${tag}<span class="jv-br">{</span><span class="jv-coll"><span class="jv-prev"> ${prev} </span><span class="jv-br">}</span>${cm}</span></summary><div class="jv-body">${inner}</div><div class="jv-open-only"><span class="jv-br">}</span>${cm}</div></details>`;
  }

  private renderArr(arr: unknown[], depth: number, key?: string, last = true, isJsonStr = false): string {
    const cm = last ? '' : '<span class="jv-cm">,</span>';
    const kh = key !== undefined
      ? `<span class="jv-k">"${this.e(key)}"</span><span class="jv-col">: </span>`
      : '';
    if (arr.length === 0) return `<div class="jv-row">${kh}${isJsonStr ? '<span class="jv-json-str">JSON </span>' : ''}<span class="jv-br">[]</span>${cm}</div>`;

    const inner = arr.map((v, i) => this.renderVal(v, depth + 1, undefined, i === arr.length - 1)).join('');
    const count = `${arr.length} item${arr.length !== 1 ? 's' : ''}`;
    const tag = isJsonStr ? `<span class="jv-json-str">JSON </span>` : '';
    if (depth === 0) {
      return `<div class="jv-row">${kh}${tag}<span class="jv-br">[</span><div class="jv-body">${inner}</div><span class="jv-br">]</span>${cm}</div>`;
    }
    return `<details open><summary>${kh}${tag}<span class="jv-br">[</span><span class="jv-coll"><span class="jv-prev"> ${count} </span><span class="jv-br">]</span>${cm}</span></summary><div class="jv-body">${inner}</div><div class="jv-open-only"><span class="jv-br">]</span>${cm}</div></details>`;
  }

  private e(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

