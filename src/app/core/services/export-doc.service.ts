import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { EndpointDetail } from '../models/models';

export interface ExportScope {
    type: 'endpoints' | 'tag' | 'system';
    label: string;
    endpointIds?: string[];
    systemId?: string;
    systemName?: string;
    environmentId?: string;
    tag?: string;
}

@Injectable({ providedIn: 'root' })
export class ExportDocService {
    private api = inject(ApiService);

    export(scope: ExportScope): void {
        const request: any = {};
        if (scope.endpointIds?.length) request['endpointIds'] = scope.endpointIds;
        else {
            if (scope.systemId) request['systemId'] = scope.systemId;
            if (scope.environmentId) request['environmentId'] = scope.environmentId;
            if (scope.tag) request['tag'] = scope.tag;
        }

        this.api.exportDocumentation(request).subscribe(res => {
            if (!res.success || !res.data) return;
            const html = this.generateHtml(scope.label, res.data);
            const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${scope.label.replace(/[^a-zA-Z0-9_-]/g, '_')}_docs.html`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    private generateHtml(title: string, endpoints: EndpointDetail[]): string {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

        const systemName = endpoints[0]?.systemName ?? '';

        // Group by env → deduplicate within each env → group by tag
        const rawEnvMap = new Map<string, { id: string; name: string; baseUrl: string; eps: EndpointDetail[] }>();
        for (const ep of endpoints) {
            const envId = ep.environmentId || 'default';
            if (!rawEnvMap.has(envId)) rawEnvMap.set(envId, { id: envId, name: ep.environmentName, baseUrl: ep.baseUrl, eps: [] });
            rawEnvMap.get(envId)!.eps.push(ep);
        }
        const envSections = Array.from(rawEnvMap.values()).map(env => {
            const seenIds = new Set<string>();
            const uniqueEps = env.eps.filter(ep => {
                const key = ep.id ?? `${ep.method}:${ep.path}`;
                if (seenIds.has(key)) return false;
                seenIds.add(key); return true;
            });
            const tagMap = new Map<string, EndpointDetail[]>();
            for (const ep of uniqueEps) {
                const tag = ep.tag?.trim() || 'General';
                if (!tagMap.has(tag)) tagMap.set(tag, []);
                tagMap.get(tag)!.push(ep);
            }
            return { id: env.id, name: env.name, baseUrl: env.baseUrl, eps: uniqueEps, tagMap };
        });
        const totalEndpoints = envSections.reduce((s, e) => s + e.eps.length, 0);
        const multiEnv = envSections.length > 1;
        const allMethods = [...new Set(endpoints.map(e => e.method))].sort();

        // Sidebar TOC
        const tocItems = envSections.map(env => {
            const tagItems = Array.from(env.tagMap.entries()).map(([tag, eps]) => `
      <li class="toc-section">
        <a href="#tag-${env.id}-${this.slug(tag)}" class="toc-section-link">
          <span class="toc-section-num">${this.esc(tag)}</span>
          <span class="toc-section-badge">${eps.length}</span>
        </a>
        <ul class="toc-endpoints">
          ${eps.map(ep => `<li data-ep-id="${ep.id}"><a href="#ep-${ep.id}"><span class="toc-method toc-${ep.method.toLowerCase()}">${ep.method}</span><span class="toc-path">${this.esc(ep.path)}</span></a></li>`).join('')}
        </ul>
      </li>`).join('');
            if (!multiEnv) return tagItems;
            return `
      <li class="toc-env">
        <a href="#env-${this.slug(env.id)}" class="toc-env-link">
          <span class="toc-env-dot"></span>
          <span class="toc-env-name">${this.esc(env.name)}</span>
          <span class="toc-section-badge">${env.eps.length}</span>
        </a>
        <ul class="toc-env-tags">${tagItems}</ul>
      </li>`;
        }).join('');

        // Content sections (grouped by env → tag)
        const sections = envSections.map(env => {
            let tagNum = 0;
            const tagSections = Array.from(env.tagMap.entries()).map(([tag, eps]) => {
                tagNum++;
                return `
      <section class="controller-section" id="tag-${env.id}-${this.slug(tag)}">
        <div class="controller-header">
          <span class="controller-num">${tagNum}</span>
          <h2 class="controller-title">${this.esc(tag)}</h2>
          <span class="controller-count">${eps.length} endpoint${eps.length !== 1 ? 's' : ''}</span>
        </div>
        ${eps.map((ep, idx) => this.renderEndpoint(ep, `${tagNum}.${idx + 1}`)).join('')}
      </section>`;
            }).join('');
            if (!multiEnv) return tagSections;
            return `
    <section class="env-section" id="env-${this.slug(env.id)}" data-env-id="${this.esc(env.id)}">
      <div class="env-section-header">
        <div class="env-section-eyebrow">Environment</div>
        <div class="env-section-title-row">
          <h2 class="env-section-title">${this.esc(env.name)}</h2>
          <div class="env-section-pills">
            <span class="env-pill">${env.eps.length} endpoint${env.eps.length !== 1 ? 's' : ''}</span>
            <span class="env-pill">${env.tagMap.size} controller${env.tagMap.size !== 1 ? 's' : ''}</span>
          </div>
        </div>
        ${env.baseUrl ? `<div class="env-section-url">${this.esc(env.baseUrl)}</div>` : ''}
      </div>
      ${tagSections}
    </section>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${this.esc(title)} — API Reference</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #F4F6F8;
  --surface: #ffffff;
  --surface2: #F8FAFC;
  --surface3: #EEF2F6;
  --border: #D9E0E7;
  --border2: var(--border);
  --text: #17202A;
  --text2: var(--text);
  --text3: #5F6C79;
  --muted: var(--text3);
  --accent: #2563EB;
  --accent-fg: #FFFFFF;
  --accent-hover: color-mix(in srgb, var(--accent) 85%, var(--text));
  --accent-light: #EEF4FF;
  --accent-border: var(--border);
  --get: #16805C;    --get-bg: #E7F7F1;    --get-border: var(--get);
  --post: var(--accent); --post-bg: var(--accent-light); --post-border: var(--accent);
  --put: #A15C00;    --put-bg: #FFF5DC;    --put-border: var(--put);
  --patch: var(--accent); --patch-bg: var(--accent-light); --patch-border: var(--accent);
  --delete: #C7383D; --delete-bg: #FDEDEE; --delete-border: var(--delete);
  --head: var(--accent); --head-bg: var(--accent-light); --head-border: var(--accent);
  --options: var(--text3); --options-bg: var(--surface2); --options-border: var(--border);
  --success-text: #147A57;
  --code: #101820;
  --code-fg: #E2EAF2;
  --code-border: #273746;
}
body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; font-size: 14px; line-height: 1.7; }
a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hover); text-decoration: underline; }
code { font-family: 'Fira Code','Cascadia Code','JetBrains Mono',Consolas,monospace; font-size: 0.875em; background: var(--surface3); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; color: var(--accent); }
pre { font-family: 'Fira Code','Cascadia Code','JetBrains Mono',Consolas,monospace; }

/* ── Layout ─────────────────────────────────────────────── */
.layout { display: flex; min-height: 100vh; }
.sidebar { width: 280px; background: var(--surface); border-right: 1px solid var(--border); position: sticky; top: 0; height: 100vh; overflow-y: auto; flex-shrink: 0; display: flex; flex-direction: column; }
.main { flex: 1; min-width: 0; }

/* ── Cover ──────────────────────────────────────────────── */
.cover { background: linear-gradient(150deg,#312e81 0%,#1e1b4b 45%,#0c0a1e 100%); color: #fff; padding: 72px 80px 64px; position: relative; overflow: hidden; }
.cover::after { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle at 15% 60%, rgba(99,102,241,.18) 0%, transparent 55%), radial-gradient(circle at 85% 15%, rgba(139,92,246,.12) 0%, transparent 50%); pointer-events: none; }
.cover-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase; color: rgba(165,180,252,.75); margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
.cover-eyebrow-line { display: inline-block; width: 28px; height: 2px; background: rgba(165,180,252,.4); border-radius: 2px; }
.cover-title { font-size: 42px; font-weight: 800; line-height: 1.1; margin-bottom: 6px; letter-spacing: -1px; }
.cover-sub { font-size: 15px; color: rgba(255,255,255,.45); margin-bottom: 52px; }
.cover-meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; overflow: hidden; background: rgba(255,255,255,.04); }
.cover-meta-item { padding: 18px 22px; border-right: 1px solid rgba(255,255,255,.07); }
.cover-meta-item:last-child { border-right: none; }
.cover-meta-label { font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(165,180,252,.65); margin-bottom: 5px; }
.cover-meta-value { font-size: 13px; color: rgba(255,255,255,.9); font-weight: 500; }
.cover-meta-value.mono { font-family: 'Fira Code',Consolas,monospace; font-size: 12px; color: rgba(167,243,208,.9); }
.cover-stats { display: flex; gap: 56px; margin-top: 44px; padding-top: 40px; border-top: 1px solid rgba(255,255,255,.1); }
.cover-stat-num { font-size: 38px; font-weight: 800; line-height: 1; background: linear-gradient(135deg,#a5b4fc,#c4b5fd); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.cover-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,.4); margin-top: 5px; font-weight: 500; }
.cover-envs { margin-top: 32px; padding-top: 28px; border-top: 1px solid rgba(255,255,255,.1); }
.cover-envs-label { font-size: 10px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: rgba(165,180,252,.65); margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
.cover-envs-count { background: rgba(165,180,252,.2); color: rgba(165,180,252,.9); font-size: 11px; padding: 1px 8px; border-radius: 20px; border: 1px solid rgba(165,180,252,.3); font-weight: 600; letter-spacing: 0; text-transform: none; }
.cover-envs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.cover-env-item { display: flex; align-items: flex-start; gap: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 8px; padding: 12px 16px; }
.cover-env-dot { width: 8px; height: 8px; border-radius: 50%; background: #a5b4fc; flex-shrink: 0; margin-top: 5px; }
.cover-env-name { font-size: 13px; font-weight: 600; color: rgba(255,255,255,.9); }
.cover-env-url { font-family: 'Fira Code',Consolas,monospace; font-size: 11px; color: rgba(167,243,208,.8); margin-top: 3px; word-break: break-all; }

/* ── Sidebar ────────────────────────────────────────────── */
.sidebar-brand { padding: 18px 20px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.sidebar-brand-title { font-size: 13px; font-weight: 700; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sidebar-brand-label { font-size: 10.5px; color: var(--muted); margin-top: 2px; }
.sidebar-inner { padding: 16px 0 40px; flex: 1; overflow-y: auto; }
.sidebar-heading { font-size: 9.5px; font-weight: 700; letter-spacing: 1.8px; text-transform: uppercase; color: var(--muted); padding: 10px 20px 6px; }
.toc-list { list-style: none; }
.toc-section { }
.toc-section-link { display: flex; align-items: center; gap: 10px; padding: 9px 20px; font-size: 13px; font-weight: 600; color: var(--text2); transition: .15s; border-left: 3px solid transparent; line-height: 1.4; }
.toc-section-link:hover { background: var(--accent-light); color: var(--accent); border-left-color: var(--accent); text-decoration: none; }
.toc-section-num { font-size: 11px; color: var(--muted); min-width: 20px; flex-shrink: 0; }
.toc-section-badge { margin-left: auto; font-size: 10.5px; font-weight: 600; background: var(--surface3); color: var(--muted); border: 1px solid var(--border); padding: 1px 8px; border-radius: 20px; flex-shrink: 0; }
.toc-endpoints { list-style: none; padding-bottom: 6px; }
.toc-endpoints li a { display: flex; align-items: flex-start; gap: 7px; padding: 5px 16px 5px 36px; font-size: 11.5px; color: var(--muted); transition: .12s; line-height: 1.4; }
.toc-endpoints li a:hover { background: var(--surface2); color: var(--text2); text-decoration: none; }
.toc-method { font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 3px; letter-spacing: .5px; flex-shrink: 0; min-width: 40px; text-align: center; margin-top: 2px; }
.toc-get     { background: var(--get-bg);     color: var(--get);     border: 1px solid var(--get-border); }
.toc-post    { background: var(--post-bg);    color: var(--post);    border: 1px solid var(--post-border); }
.toc-put     { background: var(--put-bg);     color: var(--put);     border: 1px solid var(--put-border); }
.toc-patch   { background: var(--patch-bg);   color: var(--patch);   border: 1px solid var(--patch-border); }
.toc-delete  { background: var(--delete-bg);  color: var(--delete);  border: 1px solid var(--delete-border); }
.toc-head, .toc-options { background: var(--head-bg); color: var(--head); border: 1px solid var(--head-border); }
.toc-path { flex: 1; min-width: 0; font-family: 'Fira Code', Consolas, monospace; font-size: 11px; word-break: break-word; white-space: normal; line-height: 1.5; }

/* ── Content ─────────────────────────────────────────────── */
.content { padding: 52px 64px 100px; max-width: 980px; }

/* ── Controller section ─────────────────────────────────── */
.controller-section { margin-bottom: 72px; }
.controller-header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid var(--border); }
.controller-num { width: 36px; height: 36px; border-radius: 10px; background: var(--accent); color: var(--accent-fg); font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.controller-title { font-size: 24px; font-weight: 700; color: var(--text); flex: 1; letter-spacing: -.3px; }
.controller-count { font-size: 12px; color: var(--muted); background: var(--surface2); border: 1px solid var(--border); padding: 4px 16px; border-radius: 20px; font-weight: 500; }

/* ── Endpoint card ──────────────────────────────────────── */
.endpoint-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.05); transition: box-shadow .2s; }
.endpoint-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.08); }
.method-get    { border-left: 4px solid var(--get); }
.method-post   { border-left: 4px solid var(--post); }
.method-put    { border-left: 4px solid var(--put); }
.method-patch  { border-left: 4px solid var(--patch); }
.method-delete { border-left: 4px solid var(--delete); }
.method-head   { border-left: 4px solid var(--head); }
.method-options{ border-left: 4px solid var(--options); }
.endpoint-card-header { padding: 18px 22px; background: var(--surface); cursor: pointer; list-style: none; border-bottom: 1px solid transparent; transition: background .15s; }
.endpoint-card[open] > .endpoint-card-header { border-bottom-color: var(--border); background: var(--surface2); }
.endpoint-card-header::-webkit-details-marker { display: none; }
.endpoint-toggle { margin-left: auto; font-size: 12px; color: var(--muted); transition: transform .2s ease; flex-shrink: 0; background: var(--surface3); border: 1px solid var(--border); padding: 3px 8px; border-radius: 6px; }
.endpoint-card[open] .endpoint-toggle { transform: rotate(180deg); }
.endpoint-title-row { display: flex; align-items: center; gap: 12px; min-width: 0; }
.ep-num { font-size: 11px; font-weight: 600; color: var(--muted); background: var(--surface3); border: 1px solid var(--border); padding: 2px 8px; border-radius: 5px; flex-shrink: 0; }
.method-badge { font-size: 11px; font-weight: 700; padding: 5px 14px; border-radius: 6px; letter-spacing: .5px; border: 1px solid; flex-shrink: 0; min-width: 68px; text-align: center; }
.badge-GET     { background: var(--get-bg);    color: var(--get);    border-color: var(--get-border); }
.badge-POST    { background: var(--post-bg);   color: var(--post);   border-color: var(--post-border); }
.badge-PUT     { background: var(--put-bg);    color: var(--put);    border-color: var(--put-border); }
.badge-PATCH   { background: var(--patch-bg);  color: var(--patch);  border-color: var(--patch-border); }
.badge-DELETE  { background: var(--delete-bg); color: var(--delete); border-color: var(--delete-border); }
.badge-HEAD    { background: var(--head-bg);   color: var(--head);   border-color: var(--head-border); }
.badge-OPTIONS { background: var(--options-bg);color: var(--options);border-color: var(--options-border); }
.ep-path { font-family: 'Fira Code','Cascadia Code',Consolas,monospace; font-size: 14px; font-weight: 600; color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deprecated-badge { font-size: 11px; background: var(--put-bg); color: var(--put); border: 1px solid var(--border); padding: 3px 10px; border-radius: 20px; flex-shrink: 0; }
.ep-meta { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
.ep-summary { font-size: 13.5px; color: var(--text2); font-weight: 500; }
.ep-description { font-size: 12.5px; color: var(--text3); line-height: 1.6; }
.endpoint-body { padding: 24px; display: flex; flex-direction: column; gap: 28px; }

/* ── Section block ──────────────────────────────────────── */
.section-block { }
.section-block-title { font-size: 10.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--text3); margin-bottom: 12px; display: flex; align-items: center; gap: 10px; }
.section-block-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

/* ── Tables ─────────────────────────────────────────────── */
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.data-table th { background: var(--surface2); color: var(--text3); font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .7px; padding: 10px 16px; text-align: left; border-bottom: 1px solid var(--border2); }
.data-table td { padding: 11px 16px; border-top: 1px solid var(--border); vertical-align: top; color: var(--text2); line-height: 1.55; }
.data-table tr:first-child td { border-top: none; }
.data-table tbody tr:hover td { background: var(--surface2); }
.required-pill { display: inline-block; font-size: 10px; font-weight: 600; background: var(--delete-bg); color: var(--delete); border: 1px solid var(--border); padding: 2px 8px; border-radius: 20px; }
.optional-pill { display: inline-block; font-size: 10px; color: var(--muted); background: var(--surface3); padding: 2px 8px; border-radius: 20px; border: 1px solid var(--border); }
.location-pill { display: inline-block; font-size: 10px; font-weight: 600; background: var(--accent-light); color: var(--accent); border: 1px solid var(--border); padding: 2px 8px; border-radius: 20px; }
.type-text { font-family: 'Fira Code',Consolas,monospace; font-size: 12px; color: var(--accent); background: var(--accent-light); padding: 1px 6px; border-radius: 4px; border: 1px solid var(--border); }

/* ── Status badges ──────────────────────────────────────── */
.status-badge { display: inline-flex; align-items: center; font-weight: 700; font-family: 'Fira Code',Consolas,monospace; font-size: 13px; padding: 4px 12px; border-radius: 6px; border: 1px solid; letter-spacing: .3px; }
.status-2xx { background: var(--get-bg); color: var(--success-text); border-color: var(--get-border); }
.status-3xx { background: var(--accent-light); color: var(--accent); border-color: var(--accent-border); }
.status-4xx { background: var(--put-bg); color: var(--put); border-color: var(--put-border); }
.status-5xx { background: var(--delete-bg); color: var(--delete); border-color: var(--delete-border); }

/* ── Response details ───────────────────────────────────── */
.response-details-cell { background: var(--surface2); padding: 16px !important; border-top: 1px dashed var(--border2) !important; }
.response-details { display: flex; flex-direction: column; gap: 12px; }

/* ── Code blocks ────────────────────────────────────────── */
.code-wrap { background: var(--code); border: 1px solid var(--code-border); border-radius: 10px; overflow: hidden; }
.code-wrap-header { background: var(--code); padding: 8px 14px; font-size: 10.5px; font-weight: 600; color: var(--code-fg); letter-spacing: 1px; text-transform: uppercase; border-bottom: 1px solid var(--code-border); display: flex; align-items: center; gap: 10px; }
.cwh-dots { display: flex; gap: 5px; }
.cwh-dot { width: 9px; height: 9px; border-radius: 50%; }
.cwh-dot:nth-child(1){background:#ff5f57;} .cwh-dot:nth-child(2){background:#ffbd2e;} .cwh-dot:nth-child(3){background:#28ca41;}
.code-block { padding: 16px; font-size: 12.5px; color: var(--code-fg); overflow-x: auto; white-space: pre; max-height: 380px; overflow-y: auto; line-height: 1.6; }

/* ── Notes ──────────────────────────────────────────────── */
.notes-block { background: var(--put-bg); border: 1px solid var(--border); border-left: 4px solid var(--put); border-radius: 8px; padding: 14px 18px; font-size: 13px; color: var(--put); line-height: 1.7; }

/* ── Scrollbars ─────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }

/* ── Print ──────────────────────────────────────────────── */
@media print {
  .sidebar { display: none; }
  .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .endpoint-card { break-inside: avoid; box-shadow: none; }
  .content { padding: 20px 0; max-width: 100%; }
}

/* ── Sidebar search ─────────────────────────────────────── */
.sidebar-search-area { padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.search-wrap { display: flex; align-items: center; background: var(--surface2); border: 1px solid var(--border2); border-radius: 8px; padding: 0 10px; gap: 6px; transition: border-color .15s, box-shadow .15s; }
.search-wrap:focus-within { border-color: var(--accent); background: var(--surface); box-shadow: 0 0 0 3px var(--accent-light); }
.search-icon { font-size: 15px; color: var(--muted); flex-shrink: 0; line-height: 1; }
.search-input { flex: 1; border: none; background: transparent; padding: 8px 0; font-size: 12.5px; color: var(--text); outline: none; min-width: 0; }
.search-input::placeholder { color: var(--muted); }
.search-clear { background: none; border: none; cursor: pointer; color: var(--muted); font-size: 12px; padding: 3px 5px; border-radius: 4px; line-height: 1; flex-shrink: 0; }
.search-clear:hover { background: var(--surface3); color: var(--text2); }
.result-count { font-size: 11px; color: var(--muted); margin-top: 6px; padding: 0 2px; }

/* ── Sidebar method/env filters ─────────────────────────── */
.sidebar-filters { padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.filter-label { font-size: 9.5px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.filter-row { display: flex; flex-wrap: wrap; gap: 5px; }
.mf { font-size: 10.5px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text3); padding: 3px 9px; border-radius: 6px; cursor: pointer; transition: all .15s; letter-spacing: .2px; }
.mf:hover { border-color: var(--border2); background: var(--surface2); color: var(--text2); }
.mf.active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.mf-get.active    { background: var(--get);    border-color: var(--get);    color: #fff; }
.mf-post.active   { background: var(--post);   border-color: var(--post);   color: #fff; }
.mf-put.active    { background: var(--put);    border-color: var(--put);    color: #fff; }
.mf-patch.active  { background: var(--patch);  border-color: var(--patch);  color: #fff; }
.mf-delete.active { background: var(--delete); border-color: var(--delete); color: #fff; }
.mf-head.active, .mf-options.active { background: var(--head); border-color: var(--head); color: #fff; }
.ef { font-size: 10.5px; font-weight: 600; border: 1px solid var(--border); background: var(--surface); color: var(--text3); padding: 3px 9px; border-radius: 6px; cursor: pointer; transition: all .15s; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ef:hover { border-color: var(--border2); background: var(--surface2); color: var(--text2); }
.ef.active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }

/* ── TOC env items ──────────────────────────────────────── */
.toc-env { margin-bottom: 2px; }
.toc-env-link { display: flex; align-items: center; gap: 8px; padding: 8px 20px; font-size: 12px; font-weight: 700; color: var(--text); border-left: 3px solid var(--accent); background: var(--accent-light); transition: background .15s; }
.toc-env-link:hover { text-decoration: none; background: var(--accent-light); filter: brightness(.97); }
.toc-env-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
.toc-env-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.toc-env-tags { list-style: none; padding-left: 10px; }

/* ── Environment sections ───────────────────────────────── */
.env-section { margin-bottom: 80px; }
.env-section-header { background: var(--surface); border: 1px solid var(--border); border-left: 5px solid var(--accent); border-radius: 12px; padding: 24px 28px; margin-bottom: 32px; box-shadow: 0 1px 4px rgba(0,0,0,.05); }
.env-section-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); margin-bottom: 8px; }
.env-section-title-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 6px; }
.env-section-title { font-size: 22px; font-weight: 800; color: var(--text); letter-spacing: -.3px; }
.env-section-pills { display: flex; gap: 8px; }
.env-pill { font-size: 11px; font-weight: 500; background: var(--accent-light); color: var(--accent); border: 1px solid var(--accent-border); padding: 3px 12px; border-radius: 20px; }
.env-section-url { font-family: 'Fira Code',Consolas,monospace; font-size: 12px; color: var(--text3); background: var(--surface2); border: 1px solid var(--border); padding: 4px 10px; border-radius: 6px; display: inline-block; margin-top: 6px; word-break: break-all; }
</style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="sidebar-brand-title">${this.esc(title)}</div>
      <div class="sidebar-brand-label">API Reference</div>
    </div>
    <div class="sidebar-search-area">
      <div class="search-wrap">
        <span class="search-icon">&#128269;</span>
        <input type="text" id="search-input" class="search-input" placeholder="Search endpoints\u2026" autocomplete="off" />
        <button id="search-clear" class="search-clear" title="Clear">&#x2715;</button>
      </div>
      <div id="result-count" class="result-count">${totalEndpoints} endpoints</div>
    </div>
    <div class="sidebar-filters">
      <div class="filter-label">Method</div>
      <div class="filter-row">
        <button class="mf active" data-method="ALL">All</button>
        ${allMethods.map(m => `<button class="mf mf-${m.toLowerCase()}" data-method="${m}">${m}</button>`).join('')}
      </div>
      ${multiEnv ? `<div class="filter-label" style="margin-top:10px">Environment</div>
      <div class="filter-row ef-row">
        <button class="ef active" data-env-id="ALL">All</button>
        ${envSections.map(e => `<button class="ef" data-env-id="${this.esc(e.id)}">${this.esc(e.name)}</button>`).join('')}
      </div>` : ''}
    </div>
    <div class="sidebar-inner">
      <div class="sidebar-heading">Contents</div>
      <ul class="toc-list">${tocItems}</ul>
    </div>
  </aside>
  <main class="main">
    <!-- Cover -->
    <div class="cover">
      <div class="cover-eyebrow"><span class="cover-eyebrow-line"></span>API Reference Documentation</div>
      <div class="cover-title">${this.esc(title)}</div>
      <div class="cover-sub">Auto-generated endpoint documentation</div>
      <div class="cover-meta-grid">
        ${systemName ? `<div class="cover-meta-item"><div class="cover-meta-label">System</div><div class="cover-meta-value">${this.esc(systemName)}</div></div>` : ''}
        ${!multiEnv ? `<div class="cover-meta-item"><div class="cover-meta-label">Environment</div><div class="cover-meta-value">${this.esc(envSections[0]?.name ?? '')}</div></div>` : ''}
        ${!multiEnv && envSections[0]?.baseUrl ? `<div class="cover-meta-item"><div class="cover-meta-label">Base URL</div><div class="cover-meta-value mono">${this.esc(envSections[0].baseUrl)}</div></div>` : ''}
        <div class="cover-meta-item"><div class="cover-meta-label">Generated</div><div class="cover-meta-value">${dateStr}</div></div>
      </div>
      ${multiEnv ? `
      <div class="cover-envs">
        <div class="cover-envs-label">Versions &amp; Environments <span class="cover-envs-count">${envSections.length}</span></div>
        <div class="cover-envs-grid">
          ${envSections.map(e => `<div class="cover-env-item"><span class="cover-env-dot"></span><div><div class="cover-env-name">${this.esc(e.name)}</div>${e.baseUrl ? `<div class="cover-env-url">${this.esc(e.baseUrl)}</div>` : ''}</div></div>`).join('')}
        </div>
      </div>` : ''}
      <div class="cover-stats">
        <div class="cover-stat"><div class="cover-stat-num">${totalEndpoints}</div><div class="cover-stat-label">Endpoints</div></div>
        <div class="cover-stat"><div class="cover-stat-num">${envSections.reduce((s, e) => s + e.tagMap.size, 0)}</div><div class="cover-stat-label">Controllers</div></div>
        ${multiEnv ? `<div class="cover-stat"><div class="cover-stat-num">${envSections.length}</div><div class="cover-stat-label">Environments</div></div>` : ''}
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      ${sections}
    </div>
  </main>
</div>
<script>
(function () {
  var q = '', am = 'ALL', ae = 'ALL';
  function filter() {
    var cards = document.querySelectorAll('.endpoint-card');
    var tv = {}, ev = {}, n = 0, txt = q.toLowerCase().trim();
    cards.forEach(function (c) {
      var ok = (am === 'ALL' || c.dataset.method === am)
             && (ae === 'ALL' || c.dataset.envId === ae)
             && (!txt || (c.dataset.path || '').toLowerCase().indexOf(txt) > -1
                      || (c.dataset.summary || '').toLowerCase().indexOf(txt) > -1
                      || (c.dataset.method || '').toLowerCase().indexOf(txt) > -1);
      c.style.display = ok ? '' : 'none';
      if (ok) {
        n++;
        var ts = c.closest('.controller-section'); if (ts) tv[ts.id] = 1;
        var es = c.closest('.env-section'); if (es) ev[es.id] = 1;
      }
    });
    document.querySelectorAll('.controller-section').forEach(function (s) { s.style.display = tv[s.id] ? '' : 'none'; });
    document.querySelectorAll('.env-section').forEach(function (s) { s.style.display = ev[s.id] ? '' : 'none'; });
    var rc = document.getElementById('result-count');
    if (rc) rc.textContent = n + (n === 1 ? ' endpoint' : ' endpoints');
    // sync sidebar TOC
    document.querySelectorAll('.toc-endpoints li[data-ep-id]').forEach(function (li) {
      var card = document.getElementById('ep-' + li.dataset.epId);
      li.style.display = (card && card.style.display !== 'none') ? '' : 'none';
    });
    document.querySelectorAll('.toc-section').forEach(function (li) {
      var ul = li.querySelector('.toc-endpoints'); if (!ul) return;
      li.style.display = [].slice.call(ul.querySelectorAll('li[data-ep-id]')).some(function (x) { return x.style.display !== 'none'; }) ? '' : 'none';
    });
    document.querySelectorAll('.toc-env').forEach(function (li) {
      var secs = li.querySelectorAll('.toc-section'); if (!secs.length) return;
      li.style.display = [].slice.call(secs).some(function (x) { return x.style.display !== 'none'; }) ? '' : 'none';
    });
  }
  var si = document.getElementById('search-input');
  if (si) si.addEventListener('input', function () { q = this.value; filter(); });
  var sc = document.getElementById('search-clear');
  if (sc) sc.addEventListener('click', function () { q = ''; document.getElementById('search-input').value = ''; filter(); });
  document.querySelectorAll('.mf').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.mf').forEach(function (x) { x.classList.remove('active'); });
      this.classList.add('active'); am = this.dataset.method; filter();
    });
  });
  document.querySelectorAll('.ef').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.ef').forEach(function (x) { x.classList.remove('active'); });
      this.classList.add('active'); ae = this.dataset.envId; filter();
    });
  });
})();
</script>
</body>
</html>`;
    }

    private renderEndpoint(ep: EndpointDetail, num: string): string {
        const paramRows = ep.parameters.map(p => {
            const schema = this.tryParseSchema(p.schema);
            const type = schema ? (schema.type ?? '') + (schema.format ? `(${schema.format})` : '') + (schema.enum ? ` [${schema.enum.join(' | ')}]` : '') : '';
            return `<tr>
        <td><code>${this.esc(p.name)}</code></td>
        <td><span class="location-pill">${p.location}</span></td>
        <td><span class="type-text">${this.esc(type)}</span></td>
        <td>${p.required ? '<span class="required-pill">required</span>' : '<span class="optional-pill">optional</span>'}</td>
        <td>${this.esc(p.description ?? '')}</td>
        <td>${this.esc(p.example ?? '')}</td>
      </tr>`;
        }).join('');

        const headerRows = ep.headers.filter(h => h.name).map(h =>
            `<tr><td><code>${this.esc(h.name)}</code></td>
       <td>${h.required ? '<span class="required-pill">required</span>' : '<span class="optional-pill">optional</span>'}</td>
       <td>${this.esc(h.description ?? '')}</td>
       <td>${this.esc(h.defaultValue ?? '')}</td></tr>`
        ).join('');

        const bodyBlocks = ep.requestBodies.map(rb => {
            const schema = rb.schema ? this.prettyJson(rb.schema) : null;
            const example = rb.example ? this.prettyJson(rb.example) : null;
            return `
        <div class="section-block">
          <div class="section-block-title">Request Body <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:11px;color:var(--text3)">${this.esc(rb.contentType)}</span></div>
          ${schema ? `<div class="code-wrap"><div class="code-wrap-header"><div class="cwh-dots"><div class="cwh-dot"></div><div class="cwh-dot"></div><div class="cwh-dot"></div></div>Schema</div><pre class="code-block">${this.esc(schema)}</pre></div>` : ''}
          ${example ? `<div class="code-wrap" style="margin-top:10px"><div class="code-wrap-header"><div class="cwh-dots"><div class="cwh-dot"></div><div class="cwh-dot"></div><div class="cwh-dot"></div></div>Example</div><pre class="code-block">${this.esc(example)}</pre></div>` : ''}
        </div>`;
        }).join('');

        const responseRows = ep.responses.map(r => {
            const cls = r.statusCode.startsWith('2') ? 'status-2xx' : r.statusCode.startsWith('3') ? 'status-3xx' : r.statusCode.startsWith('4') ? 'status-4xx' : r.statusCode.startsWith('5') ? 'status-5xx' : '';
          const schema = r.schema
            ? `<div class="code-wrap"><div class="code-wrap-header"><div class="cwh-dots"><div class="cwh-dot"></div><div class="cwh-dot"></div><div class="cwh-dot"></div></div>Schema</div><pre class="code-block">${this.esc(this.prettyJson(r.schema))}</pre></div>`
            : '';
          const example = r.example
            ? `<div class="code-wrap"><div class="code-wrap-header"><div class="cwh-dots"><div class="cwh-dot"></div><div class="cwh-dot"></div><div class="cwh-dot"></div></div>Example</div><pre class="code-block">${this.esc(this.prettyJson(r.example))}</pre></div>`
            : '';
            const codeSections = schema || example || '<span class="optional-pill">No schema / example</span>';
            return `<tr>
        <td><span class="status-badge ${cls}">${this.esc(r.statusCode)}</span></td>
        <td>${this.esc(r.description ?? '')}</td>
        <td><span style="font-family:monospace;font-size:12px">${this.esc(r.contentType ?? '')}</span></td>
      </tr>
      <tr>
        <td colspan="3" class="response-details-cell"><div class="response-details">${codeSections}</div></td>
      </tr>`;
        }).join('');

        return `
<details class="endpoint-card method-${ep.method.toLowerCase()}" id="ep-${ep.id}" data-method="${ep.method}" data-env-id="${this.esc(ep.environmentId ?? '')}" data-path="${this.esc(ep.path)}" data-summary="${this.esc(ep.summary ?? '')}" open>
  <summary class="endpoint-card-header">
    <div class="endpoint-title-row">
      <span class="ep-num">${num}</span>
      <span class="method-badge badge-${ep.method}">${ep.method}</span>
      <code class="ep-path">${this.esc(ep.path)}</code>
      ${ep.isDeprecated ? '<span class="deprecated-badge">Deprecated</span>' : ''}
      <span class="endpoint-toggle">▾</span>
    </div>
    ${(ep.summary || ep.description) ? `<div class="ep-meta">${ep.summary ? `<div class="ep-summary">${this.esc(ep.summary)}</div>` : ''}${ep.description ? `<div class="ep-description">${this.esc(ep.description)}</div>` : ''}</div>` : ''}
  </summary>
  <div class="endpoint-body">
    ${ep.parameters.length ? `
      <div class="section-block">
        <div class="section-block-title">Parameters</div>
        <table class="data-table"><thead><tr><th>Name</th><th>In</th><th>Type</th><th></th><th>Description</th><th>Example</th></tr></thead>
        <tbody>${paramRows}</tbody></table>
      </div>` : ''}

    ${ep.headers.length ? `
      <div class="section-block">
        <div class="section-block-title">Request Headers</div>
        <table class="data-table"><thead><tr><th>Name</th><th></th><th>Description</th><th>Default</th></tr></thead>
        <tbody>${headerRows}</tbody></table>
      </div>` : ''}

    ${bodyBlocks}

    ${ep.responses.length ? `
      <div class="section-block">
        <div class="section-block-title">Responses</div>
        <table class="data-table"><thead><tr><th>Status</th><th>Description</th><th>Content-Type</th></tr></thead>
        <tbody>${responseRows}</tbody></table>
      </div>` : ''}

    ${ep.notes ? `<div class="section-block"><div class="section-block-title">Notes</div><div class="notes-block">${this.esc(ep.notes)}</div></div>` : ''}
  </div>
</details>`;
    }

    private tryParseSchema(s?: string): any | null {
        if (!s) return null;
        try { return JSON.parse(s); } catch { return null; }
    }

    private prettyJson(s: string): string {
        try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
    }

    private slug(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
    private esc(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
