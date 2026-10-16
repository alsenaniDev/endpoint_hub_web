import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OrganizationInvitation, OrganizationMember, OrganizationRole, apiErrorKey } from '../../core/models/organization';
import { AuthService } from '../../core/services/auth.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

type LifecyclePanelMode = 'organization' | 'members' | 'invitations';

@Component({
  selector: 'app-organization-lifecycle-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  template: `
    <section class="lifecycle-panel">
      <div *ngIf="error()" class="lifecycle-message error" role="alert">{{ error()! | t }}</div>
      <div *ngIf="message()" class="lifecycle-message" role="status">{{ message()! | t }}</div>

      <ng-container *ngIf="mode === 'organization'">
        <form *ngIf="canManageOrganization(); else organizationReadOnly" (ngSubmit)="saveOrganization()">
          <label>{{ 'common.name' | t }}
            <input name="organizationName" [(ngModel)]="organizationName" maxlength="200" required autocomplete="off">
          </label>
          <button type="submit" [disabled]="busy() || !organizationName.trim()">{{ 'org.saveName' | t }}</button>
        </form>
        <ng-template #organizationReadOnly>
          <p>{{ 'org.organizationNameReadOnly' | t }}</p>
        </ng-template>
        <button type="button" class="danger" (click)="leave()" [disabled]="busy()">{{ 'org.leaveOrganization' | t }}</button>
      </ng-container>

      <ng-container *ngIf="mode === 'members'">
        <p *ngIf="!canManageMembers()">{{ 'org.memberActionsUnsupported' | t }}</p>
        <ng-container *ngIf="canManageMembers()">
          <p *ngIf="!assignableRoles().length" role="note">{{ 'org.assignableRolesUnavailable' | t }}</p>
          <div class="lifecycle-member" *ngFor="let member of members; trackBy: trackMember">
            <span><strong>{{ member.fullName || member.username }}</strong><small>{{ member.role.name }}</small></span>
            <label>
              <span class="sr-only">{{ 'org.changeRole' | t }}</span>
              <select [ngModel]="roleSelections()[member.id] || member.role.id"
                (ngModelChange)="setRoleSelection(member.id, $event)" [disabled]="busy() || !assignableRoles().length">
                <option *ngFor="let role of assignableRoles()" [value]="role.id">{{ role.name }}</option>
              </select>
            </label>
            <button type="button" (click)="changeRole(member)" [disabled]="busy() || !assignableRoles().length || (roleSelections()[member.id] || member.role.id) === member.role.id">
              {{ 'org.changeRole' | t }}
            </button>
            <button *ngIf="member.userId !== currentUserId()" type="button" class="danger" (click)="remove(member)"
              [disabled]="busy() || (member.role.name === 'Owner' && !isOwnerActor())">
              {{ 'org.removeMember' | t }}
            </button>
          </div>
        </ng-container>
      </ng-container>

      <ng-container *ngIf="mode === 'invitations'">
        <ng-container *ngIf="canManageInvitations(); else invitationsReadOnly">
          <form (ngSubmit)="invite()">
            <label>{{ 'org.inviteEmail' | t }}
              <input type="email" name="inviteEmail" [(ngModel)]="inviteEmail" required maxlength="200" autocomplete="off">
            </label>
            <label>{{ 'org.role' | t }}
              <select name="inviteRole" [(ngModel)]="inviteRoleId" required [disabled]="busy() || !invitableRoles().length">
                <option value="">{{ 'org.selectInvitationRole' | t }}</option>
                <option *ngFor="let role of invitableRoles()" [value]="role.id">{{ role.name }}</option>
              </select>
            </label>
            <button type="submit" [disabled]="busy() || !inviteEmail.trim() || !inviteRoleId">{{ 'org.invite' | t }}</button>
          </form>
          <p *ngIf="!invitableRoles().length" role="note">{{ 'org.assignableRolesUnavailable' | t }}</p>
          <h3>{{ 'org.pendingInvitations' | t }}</h3>
          <p *ngIf="!invitations().length">{{ 'org.noInvitations' | t }}</p>
          <div class="lifecycle-invitation" *ngFor="let invitation of invitations(); trackBy: trackInvitation">
            <span><strong>{{ invitation.email }}</strong><small>{{ invitation.roleName }} · {{ invitation.status }}</small></span>
            <button type="button" (click)="cancelInvitation(invitation)" [disabled]="busy() || invitation.status !== 'Pending'">
              {{ 'org.cancelInvitation' | t }}
            </button>
          </div>
          <p>{{ 'org.deliveryNotice' | t }}</p>
        </ng-container>
        <ng-template #invitationsReadOnly>
          <p>{{ 'org.invitationsUnsupported' | t }}</p>
          <p>{{ 'org.pendingUnsupported' | t }}</p>
        </ng-template>
      </ng-container>
    </section>
  `,
  styles: [`
    .lifecycle-panel { display:flex; flex-direction:column; gap:.75rem; margin-block:1rem; }
    .lifecycle-panel form, .lifecycle-member, .lifecycle-invitation { display:flex; align-items:end; gap:.75rem; flex-wrap:wrap; }
    .lifecycle-member, .lifecycle-invitation { justify-content:space-between; padding:.75rem; border:1px solid var(--border); border-radius:.5rem; }
    .lifecycle-panel label { display:flex; flex-direction:column; gap:.25rem; }
    .lifecycle-panel input, .lifecycle-panel select, .lifecycle-panel button { padding:.5rem; }
    .lifecycle-panel small { display:block; opacity:.75; }
    .lifecycle-message { padding:.5rem; }
    .lifecycle-message.error, .danger { color:var(--danger, #a11); }
    .sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
  `]
})
export class OrganizationLifecyclePanelComponent implements OnInit, OnChanges {
  @Input() mode: LifecyclePanelMode = 'members';
  @Input() members: readonly OrganizationMember[] = [];
  @Output() changed = new EventEmitter<void>();

  readonly context = inject(OrganizationContextService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly assignableRoles = signal<OrganizationRole[]>([]);
  readonly invitations = signal<OrganizationInvitation[]>([]);
  readonly roleSelections = signal<Record<string, string>>({});
  inviteEmail = '';
  inviteRoleId = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly canManageOrganization = computed(() => this.context.canMutate() && this.context.hasPermission('organizations.manage'));
  readonly canManageMembers = computed(() => this.context.canMutate() && this.context.hasPermission('organizations.members.manage'));
  readonly canManageInvitations = computed(() => this.context.canMutate() && this.context.hasPermission('organizations.invitations.manage'));
  readonly isOwnerActor = computed(() => this.context.membership()?.role.name === 'Owner');
  readonly currentUserId = computed(() => this.auth.currentUser()?.userId ?? null);
  readonly invitableRoles = computed(() => this.assignableRoles().filter(role => role.name !== 'Owner'));

  private nameDraft = signal('');

  set organizationName(value: string) { this.nameDraft.set(value); }
  get organizationName(): string { return this.nameDraft(); }

  ngOnInit(): void {
    this.nameDraft.set(this.context.activeOrganization()?.name ?? '');
    this.syncRoleSelections();
    if (this.mode === 'members' && this.canManageMembers()) void this.loadAssignableRoles();
    if (this.mode === 'invitations' && this.canManageInvitations()) {
      void this.loadAssignableRoles();
      void this.loadInvitations();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['members']) this.syncRoleSelections();
  }

  private syncRoleSelections(): void {
    const values: Record<string, string> = {};
    for (const member of this.members) values[member.id] = member.role.id;
    this.roleSelections.set(values);
  }

  setRoleSelection(memberId: string, roleId: string): void {
    this.roleSelections.update(values => ({ ...values, [memberId]: roleId }));
  }

  trackMember(_: number, member: OrganizationMember): string { return member.id; }
  trackInvitation(_: number, invitation: OrganizationInvitation): string { return invitation.id; }

  private errorKey(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? apiErrorKey(error.status, error.error?.message)
      : 'org.requestFailed';
  }

  private async loadAssignableRoles(): Promise<void> {
    try {
      const response = await firstValueFrom(this.context.getAssignableRoles());
      this.assignableRoles.set(response.success && response.data ? [...response.data] : []);
    } catch (error) {
      this.error.set(this.errorKey(error));
    }
  }

  private async loadInvitations(): Promise<void> {
    try {
      const response = await firstValueFrom(this.context.getInvitations());
      this.invitations.set(response.success && response.data ? [...response.data] : []);
    } catch (error) {
      this.error.set(this.errorKey(error));
    }
  }

  async saveOrganization(): Promise<void> {
    const name = this.organizationName.trim();
    if (!name || !this.canManageOrganization()) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      const response = await firstValueFrom(this.context.updateOrganizationName(name));
      if (!response.success) throw new Error('org.requestFailed');
      this.message.set('org.organizationUpdated');
      await this.context.refreshDiscoveryWithoutSwitching(false);
      this.changed.emit();
    } catch (error) { this.error.set(this.errorKey(error)); }
    finally { this.busy.set(false); }
  }

  async invite(): Promise<void> {
    if (!this.canManageInvitations() || !this.inviteEmail.trim() || !this.inviteRoleId) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      const response = await firstValueFrom(this.context.createInvitation(this.inviteEmail.trim(), this.inviteRoleId));
      if (!response.success) throw new Error('org.requestFailed');
      this.inviteEmail = ''; this.inviteRoleId = '';
      this.message.set('org.invitationCreated');
      await this.loadInvitations();
    } catch (error) { this.error.set(this.errorKey(error)); }
    finally { this.busy.set(false); }
  }

  async cancelInvitation(invitation: OrganizationInvitation): Promise<void> {
    if (!this.canManageInvitations() || invitation.status !== 'Pending') return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      await firstValueFrom(this.context.cancelInvitation(invitation.id));
      this.message.set('org.invitationCancelledSuccess');
      await this.loadInvitations();
    } catch (error) { this.error.set(this.errorKey(error)); }
    finally { this.busy.set(false); }
  }

  async changeRole(member: OrganizationMember): Promise<void> {
    const roleId = this.roleSelections()[member.id];
    if (!this.canManageMembers() || !roleId || roleId === member.role.id) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      const response = await firstValueFrom(this.context.changeMemberRole(member.id, roleId));
      if (!response.success) throw new Error('org.requestFailed');
      this.message.set('org.memberRoleChanged');
      this.changed.emit();
    } catch (error) { this.error.set(this.errorKey(error)); }
    finally { this.busy.set(false); }
  }

  async remove(member: OrganizationMember): Promise<void> {
    if (!this.canManageMembers()) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      const response = await firstValueFrom(this.context.removeMember(member.id));
      if (!response.success) throw new Error('org.requestFailed');
      this.message.set('org.memberRemoved');
      this.changed.emit();
    } catch (error) { this.error.set(this.errorKey(error)); }
    finally { this.busy.set(false); }
  }

  async leave(): Promise<void> {
    if (!this.context.ready()) return;
    this.busy.set(true); this.error.set(null); this.message.set(null);
    try {
      const response = await firstValueFrom(this.context.leaveOrganization());
      if (!response.success) throw new Error('org.requestFailed');
      const user = this.auth.currentUser();
      if (user) await this.context.refreshDiscoveryWithoutSwitching(true);
      await this.router.navigate(['/organizations']);
    } catch (error) { this.error.set(this.errorKey(error)); }
    finally { this.busy.set(false); }
  }
}
