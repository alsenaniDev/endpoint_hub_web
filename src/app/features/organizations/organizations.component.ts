import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, EMPTY, forkJoin, startWith, Subscription, switchMap, tap } from 'rxjs';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { AuthService } from '../../core/services/auth.service';
import { OrganizationMember, OrganizationRole } from '../../core/models/organization';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { apiErrorKey } from '../../core/models/organization';
import { managementPermissions } from '../../core/authorization/organization-navigation';
import { OrganizationLifecyclePanelComponent } from './organization-lifecycle-panel.component';

@Component({
  selector: 'app-organizations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslatePipe, OrganizationLifecyclePanelComponent],
  template: `
    <section class="organization-settings" *ngIf="!workbench; else membersWorkspace">
      <h1>{{ 'org.settings' | t }}</h1>
      <p *ngIf="context.loading()" role="status">{{ 'common.loading' | t }}</p>
      <p *ngIf="context.error()" role="alert">{{ context.error()! | t }}</p>
      <button type="button" (click)="reload()" [disabled]="context.loading()">{{ 'org.reload' | t }}</button>
      <h2>{{ 'org.available' | t }}</h2>
      <p *ngIf="!context.loading() && !context.organizations().length">{{ 'org.noMembership' | t }}</p>
      <ul>
        <li *ngFor="let org of context.organizations()">
          {{ org.membership.isReadOnly ? org.id : org.name }} -
          {{ org.membership.isReadOnly ? ('org.structuralOnly' | t) : org.type }} -
          {{ org.membership.isReadOnly ? org.membership.role.id : org.membership.role.name }}
          <button type="button" (click)="context.selectOrganization(org.id)"
            [disabled]="context.loading() || (context.ready() && context.activeOrganizationId() === org.id)">
            {{ (context.activeOrganizationId() === org.id ? 'org.current' : 'org.switch') | t }}
          </button>
        </li>
      </ul>
      <button type="button" disabled>{{ 'org.create' | t }}</button>
      <p>{{ 'org.creationUnsupported' | t }}</p>

      <ng-container *ngIf="context.ready()">
        <a [routerLink]="context.landingPath()">{{ 'org.openWorkspace' | t }}</a>
        <p *ngIf="context.structuralOnly()" role="note">{{ 'org.structuralOnly' | t }}</p>
        <h2>{{ 'org.information' | t }}</h2>
        <dl>
          <dt>{{ 'common.name' | t }}</dt><dd>{{ context.structuralOnly() ? context.activeOrganizationId() : context.activeOrganization()?.name }}</dd>
          <dt>{{ 'org.type' | t }}</dt><dd>{{ context.structuralOnly() ? ('org.structuralOnly' | t) : context.activeOrganization()?.type }}</dd>
          <dt>{{ 'org.myRole' | t }}</dt><dd data-testid="membership-role">{{ context.structuralOnly() ? context.membership()?.role?.id : context.membership()?.role?.name }}</dd>
        </dl>
        <p *ngIf="loading()" role="status">{{ 'common.loading' | t }}</p>
        <p *ngIf="directoryError()" role="alert">{{ 'org.directoryFailed' | t }}</p>
        <h2>{{ 'org.members' | t }}</h2>
        <table *ngIf="!directoryError()">
          <thead><tr><th>{{ 'org.member' | t }}</th><th>{{ 'org.role' | t }}</th><th>{{ 'common.status' | t }}</th></tr></thead>
          <tbody><tr *ngFor="let member of members()">
            <td>{{ context.structuralOnly() ? member.userId : (member.fullName || member.username) }}</td>
            <td>{{ context.structuralOnly() ? member.role.id : member.role.name }}</td><td>{{ member.state }}</td>
          </tr></tbody>
        </table>
        <p>{{ 'org.memberActionsUnsupported' | t }}</p>
        <h2>{{ 'org.roles' | t }}</h2>
        <ul><li *ngFor="let role of roles()">{{ context.structuralOnly() ? role.id : role.name }}<span *ngIf="!context.structuralOnly() && role.description"> - {{ role.description }}</span></li></ul>

        <h2>{{ 'org.invitations' | t }}</h2>
        <p role="status">{{ 'org.invitationsUnsupported' | t }}</p>
        <label>{{ 'org.inviteEmail' | t }} <input type="email" disabled autocomplete="off"></label>
        <label>{{ 'org.role' | t }}
          <select disabled><option *ngFor="let role of roles()" [value]="role.id">{{ context.structuralOnly() ? role.id : role.name }}</option></select>
        </label>
        <button type="button" disabled>{{ 'org.invite' | t }}</button>
        <h3>{{ 'org.pendingInvitations' | t }}</h3>
        <p>{{ 'org.pendingUnsupported' | t }}</p>
      </ng-container>
    </section>
    <ng-template #membersWorkspace>
      <section class="members-workspace">
        <header class="members-header">
          <div>
            <nav class="members-breadcrumb" [attr.aria-label]="'members.context' | t">
              <span>{{ context.structuralOnly() ? context.activeOrganizationId() : context.activeOrganization()?.name }}</span>
              <span aria-hidden="true">/</span><span>{{ 'members.settings' | t }}</span>
            </nav>
            <h1>{{ 'org.settings' | t }}</h1>
            <p>{{ 'members.subtitle' | t }}</p>
          </div>
          <div class="members-actions">
            <button class="members-button" (click)="reload()" [disabled]="context.loading()">{{ 'org.reload' | t }}</button>
          </div>
        </header>
        <nav class="settings-tabs" [attr.aria-label]="'members.settings' | t">
          <button type="button" data-settings-tab="organization" [class.active]="activeTab === 'organization'" [attr.aria-pressed]="activeTab === 'organization'" (click)="activeTab = 'organization'">{{ 'members.organization' | t }}</button>
          <button type="button" data-settings-tab="members" [class.active]="activeTab === 'members'" [attr.aria-pressed]="activeTab === 'members'" (click)="activeTab = 'members'">{{ 'org.members' | t }}</button>
          <button type="button" data-settings-tab="roles" [class.active]="activeTab === 'roles'" [attr.aria-pressed]="activeTab === 'roles'" (click)="activeTab = 'roles'">{{ 'org.roles' | t }}</button>
          <button type="button" data-settings-tab="invitations" [class.active]="activeTab === 'invitations'" [attr.aria-pressed]="activeTab === 'invitations'" (click)="activeTab = 'invitations'">{{ 'org.invitations' | t }}</button>
          <a *ngIf="canUseManagementCommands()" data-settings-tab="management" routerLink="/workbench/settings/management">{{ 'management.title' | t }}</a>
        </nav>
        <p class="members-message" *ngIf="context.structuralOnly()" role="note">{{ 'org.structuralOnly' | t }}</p>
        <div class="members-message error" *ngIf="context.error()" role="alert">{{ context.error()! | t }}</div>
        <div class="members-message error" *ngIf="directoryError()" role="alert">
          <div><strong>{{ directoryErrorKey() | t }}</strong><p>{{ 'org.directoryFailed' | t }}</p></div>
          <button class="members-button" (click)="reload()" [disabled]="context.loading()">{{ 'org.reload' | t }}</button>
        </div>
        <div class="members-state" *ngIf="loading() || context.loading()" role="status"><span class="pi pi-spin pi-spinner" aria-hidden="true"></span>{{ 'members.loading' | t }}</div>
        <p class="members-message" *ngIf="!context.ready() && !context.loading()">{{ 'org.noMembership' | t }}</p>
        <ng-container *ngIf="context.ready() && !loading() && !directoryError()">
          <section class="settings-information" *ngIf="activeTab === 'organization'" aria-labelledby="organization-information-title">
            <header class="settings-panel-heading">
              <div><h2 id="organization-information-title">{{ 'org.information' | t }}</h2><p>{{ 'members.readOnly' | t }}</p></div>
              <span class="read-only-badge">{{ 'members.readOnly' | t }}</span>
            </header>
            <dl class="organization-fields">
              <div><dt>{{ 'common.name' | t }}</dt><dd>{{ context.structuralOnly() ? context.activeOrganizationId() : context.activeOrganization()?.name }}</dd></div>
              <div><dt>{{ 'org.type' | t }}</dt><dd>{{ context.structuralOnly() ? ('org.structuralOnly' | t) : context.activeOrganization()?.type }}</dd></div>
              <div *ngIf="!context.structuralOnly()"><dt>{{ 'org.slug' | t }}</dt><dd data-testid="organization-slug"><code>{{ context.activeOrganization()?.slug }}</code></dd></div>
              <div><dt>{{ 'org.myRole' | t }}</dt><dd data-testid="organization-membership-role">{{ context.structuralOnly() ? context.membership()?.role?.id : context.membership()?.role?.name }}</dd></div>
              <div><dt>{{ 'common.status' | t }}</dt><dd>{{ context.membership()?.state }}</dd></div>
            </dl>
            <div class="members-access-note settings-unavailable-note" role="note">
              <span class="pi pi-info-circle" aria-hidden="true"></span>
              <div><strong>{{ 'members.readOnly' | t }}</strong><p>{{ 'org.creationUnsupported' | t }}</p></div>
            </div>
          </section>
          <app-organization-lifecycle-panel *ngIf="activeTab === 'organization'" mode="organization"
            (changed)="reload()"></app-organization-lifecycle-panel>
          <section class="invitations-panel" *ngIf="activeTab === 'invitations'" aria-labelledby="invitations-title">
            <header class="settings-panel-heading"><div><h2 id="invitations-title">{{ 'org.invitations' | t }}</h2></div></header>
            <app-organization-lifecycle-panel mode="invitations" (changed)="reload()"></app-organization-lifecycle-panel>
          </section>
          <ng-container *ngIf="activeTab === 'members'">
          <app-organization-lifecycle-panel mode="members" [members]="members()" [roles]="roles()"
            (changed)="reload()"></app-organization-lifecycle-panel>
          <div class="membership-strip">
            <div><span>{{ 'members.directoryCount' | t }}</span><strong>{{ members().length }}</strong></div>
            <div><span>{{ 'members.activeCount' | t }}</span><strong>{{ activeMemberCount() }}</strong></div>
            <div><span>{{ 'members.availableRoles' | t }}</span><strong>{{ roles().length }}</strong></div>
            <div><span>{{ 'org.myRole' | t }}</span><strong data-testid="membership-role">{{ context.structuralOnly() ? context.membership()?.role?.id : context.membership()?.role?.name }}</strong></div>
          </div>
          <div class="members-access-note" *ngIf="!context.hasPermission('organizations.members.manage')"><span class="pi pi-info-circle" aria-hidden="true"></span><div><strong>{{ 'members.readOnlyDirectory' | t }}</strong><p>{{ 'org.memberActionsUnsupported' | t }}</p></div></div>
          <section class="member-directory" *ngIf="activeTab === 'members'">
            <div class="directory-toolbar">
              <label class="member-search" *ngIf="!context.structuralOnly()"><span class="pi pi-search" aria-hidden="true"></span><input type="search" [ngModel]="search()" (ngModelChange)="setSearch($event)" [placeholder]="'members.search' | t" [attr.aria-label]="'members.search' | t"></label>
              <label class="member-filter"><span>{{ 'org.role' | t }}</span><select [ngModel]="roleFilter()" (ngModelChange)="setRoleFilter($event)"><option value="">{{ 'members.allRoles' | t }}</option><option *ngFor="let role of roles()" [value]="role.id">{{ context.structuralOnly() ? role.id : role.name }}</option></select></label>
              <span class="directory-count">{{ filteredMembers().length }} / {{ members().length }}</span>
            </div>
            <div class="members-state" *ngIf="!filteredMembers().length"><span class="pi pi-users" aria-hidden="true"></span><h2>{{ (members().length ? 'members.noMatches' : 'members.empty') | t }}</h2><p>{{ (members().length ? 'members.adjustFilters' : 'members.emptyHint') | t }}</p></div>
            <div class="member-table-scroll" *ngIf="filteredMembers().length">
              <table class="member-table">
                <thead><tr><th>{{ 'org.member' | t }}</th><th>{{ 'members.username' | t }}</th><th>{{ 'org.role' | t }}</th><th>{{ 'common.status' | t }}</th><th><span class="sr-only">{{ 'members.actions' | t }}</span></th></tr></thead>
                <tbody><tr *ngFor="let member of pagedMembers(); trackBy: trackMember" [class.selected]="selectedId() === member.id">
                  <td><button class="member-select" (click)="selectMember(member.id)" [attr.aria-pressed]="selectedId() === member.id"><span class="member-avatar" aria-hidden="true">{{ context.structuralOnly() ? '#' : (member.fullName || member.username).slice(0, 1).toUpperCase() }}</span><span><strong>{{ context.structuralOnly() ? member.userId : (member.fullName || member.username) }}</strong><small *ngIf="member.userId === context.membership()?.userId">{{ 'members.you' | t }}</small></span></button></td>
                  <td>{{ context.structuralOnly() ? member.userId : member.username }}</td>
                  <td><span class="member-role-badge">{{ context.structuralOnly() ? member.role.id : member.role.name }}</span></td>
                  <td><span class="membership-status">{{ member.state }}</span></td>
                  <td><details class="member-menu"><summary [attr.aria-label]="'members.actions' | t"><span class="pi pi-ellipsis-h" aria-hidden="true"></span></summary><div><button (click)="selectMember(member.id)">{{ 'members.inspect' | t }}</button><button disabled [attr.title]="'org.memberActionsUnsupported' | t">{{ 'members.changeRole' | t }}</button><button disabled [attr.title]="'org.memberActionsUnsupported' | t">{{ 'members.remove' | t }}</button><p>{{ 'org.memberActionsUnsupported' | t }}</p></div></details></td>
                </tr></tbody>
              </table>
            </div>
            <footer class="directory-pagination" *ngIf="filteredMembers().length"><span>{{ (page() - 1) * pageSize + 1 }}–{{ page() * pageSize > filteredMembers().length ? filteredMembers().length : page() * pageSize }} {{ 'members.of' | t }} {{ filteredMembers().length }}</span><div><button class="members-button" (click)="changePage(-1)" [disabled]="page() === 1">{{ 'members.previous' | t }}</button><span>{{ page() }} / {{ totalPages() }}</span><button class="members-button" (click)="changePage(1)" [disabled]="page() >= totalPages()">{{ 'members.next' | t }}</button></div></footer>
          </section>
          </ng-container>
          <section class="roles-directory" *ngIf="activeTab === 'roles'">
            <div class="members-section-heading"><h2>{{ 'org.roles' | t }}</h2><span>{{ roles().length }}</span></div><p>{{ 'members.rolesHint' | t }}</p>
            <div class="member-table-scroll"><table class="member-table"><thead><tr><th>{{ 'org.role' | t }}</th><th>{{ 'members.description' | t }}</th><th>{{ 'members.roleId' | t }}</th></tr></thead><tbody><tr *ngFor="let role of roles()"><td>{{ context.structuralOnly() ? role.id : role.name }}</td><td>{{ context.structuralOnly() ? ('org.structuralOnly' | t) : (role.description || ('members.notProvided' | t)) }}</td><td><code>{{ role.id }}</code></td></tr></tbody></table></div><div class="members-state" *ngIf="!roles().length">{{ 'members.noRoles' | t }}</div>
          </section>
          <ng-container *ngIf="activeTab === 'members'">
          <div class="member-detail-layout">
            <section class="member-detail-panel">
              <div class="members-section-heading"><h2>{{ 'members.selected' | t }}</h2><span>{{ 'members.readOnly' | t }}</span></div>
              <ng-container *ngIf="selectedMember() as member; else selectPrompt">
                <div class="selected-member-heading"><span class="member-avatar" aria-hidden="true">{{ context.structuralOnly() ? '#' : (member.fullName || member.username).slice(0,1).toUpperCase() }}</span><div><strong>{{ context.structuralOnly() ? member.userId : (member.fullName || member.username) }}</strong><p>{{ member.state }}</p></div></div>
                <dl><div><dt>{{ 'org.role' | t }}</dt><dd>{{ context.structuralOnly() ? member.role.id : member.role.name }}</dd></div><div><dt>{{ 'members.username' | t }}</dt><dd>{{ context.structuralOnly() ? member.userId : member.username }}</dd></div><div><dt>{{ 'members.membershipId' | t }}</dt><dd><code>{{ member.id }}</code></dd></div><div><dt>{{ 'members.userId' | t }}</dt><dd><code>{{ member.userId }}</code></dd></div></dl>
                <p class="role-description" *ngIf="!context.structuralOnly() && member.role.description">{{ member.role.description }}</p>
              </ng-container>
              <ng-template #selectPrompt><div class="members-state">{{ 'members.selectPrompt' | t }}</div></ng-template>
            </section>
            <aside class="member-detail-panel access-context">
              <div class="members-section-heading"><h2>{{ 'members.accessContext' | t }}</h2><span class="pi pi-shield" aria-hidden="true"></span></div>
              <p>{{ 'members.accessHint' | t }}</p>
              <dl><div><dt>{{ 'org.myRole' | t }}</dt><dd>{{ context.structuralOnly() ? context.membership()?.role?.id : context.membership()?.role?.name }}</dd></div><div><dt>{{ 'members.accessMode' | t }}</dt><dd>{{ (context.structuralOnly() ? 'org.structuralOnly' : 'members.liveMembership') | t }}</dd></div><div><dt>{{ 'org.invitations' | t }}</dt><dd>{{ 'members.unavailable' | t }}</dd></div></dl>
              <p class="unsupported-note">{{ 'org.invitationsUnsupported' | t }}</p>
              <p class="unsupported-note">{{ 'members.permissionHint' | t }}</p>
            </aside>
          </div>
          </ng-container>
        </ng-container>
      </section>
    </ng-template>
  `,
  styles: [`
    .organization-settings { padding:1.5rem; max-width:70rem; }
    table { width:100%; border-collapse:collapse; }
    td,th { text-align:start; padding:.7rem; border-bottom:1px solid var(--border); }
    button,select,input { margin:.35rem; padding:.4rem; }
    dt { font-weight:600; } dd { margin:.25rem 0 1rem; }
  `],
  styleUrls: ['./members-workspace.scss']
})
export class OrganizationsComponent implements OnInit, OnDestroy {
  readonly context = inject(OrganizationContextService);
  private readonly auth = inject(AuthService);
  readonly workbench = inject(Router).url.startsWith('/workbench');
  readonly canUseManagementCommands = computed(() => this.context.ready() && this.context.canMutate() &&
    managementPermissions.some(permission => this.context.hasPermission(permission)));
  readonly members = signal<OrganizationMember[]>([]);
  readonly roles = signal<OrganizationRole[]>([]);
  readonly loading = signal(false);
  readonly directoryError = signal(false);
  readonly directoryErrorKey = signal('org.directoryFailed');
  readonly search = signal('');
  readonly roleFilter = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = 10;
  activeTab: 'organization' | 'members' | 'roles' | 'invitations' = 'members';
  readonly activeMemberCount = computed(() => this.members().filter(member => member.state === 'Active').length);
  readonly filteredMembers = computed(() => {
    const search = this.context.structuralOnly() ? '' : this.search().trim().toLowerCase();
    return this.members().filter(member => (!this.roleFilter() || member.role.id === this.roleFilter())
      && (!search || `${member.fullName ?? ''} ${member.username} ${member.role.name}`.toLowerCase().includes(search)));
  });
  readonly pagedMembers = computed(() => this.filteredMembers().slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize));
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredMembers().length / this.pageSize)));
  readonly selectedMember = computed(() => this.filteredMembers().find(member => member.id === this.selectedId()) ?? null);
  private subscription: Subscription | null = null;

  ngOnInit(): void {
    this.subscription = this.context.changes$.pipe(
      startWith(undefined),
      tap(() => {
        this.members.set([]); this.roles.set([]); this.directoryError.set(false);
        this.directoryErrorKey.set('org.directoryFailed');
        this.selectedId.set(null); this.search.set(''); this.roleFilter.set(''); this.page.set(1);
        this.activeTab = 'members';
      }),
      switchMap(() => {
        this.loading.set(this.context.ready());
        return this.context.ready() ? forkJoin({
          members: this.context.getMembers(), roles: this.context.getRoles()
        }).pipe(catchError(error => {
          this.loading.set(false);
          this.directoryError.set(true);
          this.directoryErrorKey.set(apiErrorKey(error?.status ?? 500));
          return EMPTY;
        })) : EMPTY;
      })
    ).subscribe(result => {
      this.loading.set(false);
      if (!result.members.success || !result.roles.success || !result.members.data || !result.roles.data) {
        this.directoryError.set(true);
        this.context.reportApiError(500);
        return;
      }
      this.members.set(result.members.data);
      this.roles.set(result.roles.data);
      this.selectedId.set(result.members.data[0]?.id ?? null);
    });
  }

  reload(): void {
    const user = this.auth.currentUser();
    if (user) void this.context.initialize(user.userId, true);
  }

  ngOnDestroy(): void { this.subscription?.unsubscribe(); }

  setSearch(value: string): void { this.search.set(value); this.resetSelection(); }
  setRoleFilter(value: string): void { this.roleFilter.set(value); this.resetSelection(); }
  private resetSelection(): void {
    this.page.set(1);
    if (!this.filteredMembers().some(member => member.id === this.selectedId())) {
      this.selectedId.set(this.filteredMembers()[0]?.id ?? null);
    }
  }
  selectMember(id: string): void { this.selectedId.set(id); }
  changePage(delta: number): void {
    const page = this.page() + delta;
    if (page < 1 || page > this.totalPages()) return;
    this.page.set(page);
    this.selectedId.set(this.pagedMembers()[0]?.id ?? null);
  }
  trackMember(_: number, member: OrganizationMember): string { return member.id; }
}
