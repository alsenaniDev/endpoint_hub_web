import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppUserListItem, AppRole, Team } from '../../core/models/models';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

@Component({
    selector: 'app-users',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule, DropdownModule, LoadingComponent, TranslatePipe],
    templateUrl: './users.component.html',
    styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
    private api = inject(ApiService);
    auth = inject(AuthService);
    private fb = inject(FormBuilder);

    users = signal<AppUserListItem[]>([]);
    roles = signal<AppRole[]>([]);
    teams = signal<Team[]>([]);
    loading = signal(true);
    saving = signal(false);

    // ── Filters ───────────────────────────────────────────────────────────────
    searchTerm = signal('');
    filterRoleId = signal('');
    filterTeamId = signal('');

    filteredUsers = computed(() => {
        const term = this.searchTerm().toLowerCase().trim();
        const roleId = this.filterRoleId();
        const teamId = this.filterTeamId();
        return this.users().filter(u => {
            const matchesSearch = !term ||
                u.username.toLowerCase().includes(term) ||
                u.email.toLowerCase().includes(term) ||
                (u.fullName?.toLowerCase().includes(term) ?? false);
            const matchesRole = !roleId || u.roleId === roleId;
            const matchesTeam = !teamId || u.teamId === teamId;
            return matchesSearch && matchesRole && matchesTeam;
        });
    });

    // Create form state
    showForm = false;
    /** Tracks whether the selected role in the create form is Developer */
    createRoleIsDeveloper = signal(false);

    // Edit form state
    editingUser = signal<AppUserListItem | null>(null);

    canManageUsers = computed(() => this.auth.hasPermission('users.manage'));

    // ── Create form ───────────────────────────────────────────────────────────
    form = this.fb.group({
        username: ['', [Validators.required, Validators.maxLength(50)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        fullName: [''],
        roleId: ['', Validators.required],
        teamId: ['']
    });

    // ── Edit form ─────────────────────────────────────────────────────────────
    editForm = this.fb.group({
        roleId: ['', Validators.required],
        teamId: ['']
    });

    /** Tracks whether the currently-selected edit-form role is Developer */
    editRoleIsDeveloper = signal(false);

    onCreateRoleChange(roleId: string): void {
        const isDev = this.roles().find(r => r.id === roleId)?.name === 'Developer';
        this.createRoleIsDeveloper.set(isDev);
        if (!isDev) this.form.patchValue({ teamId: '' });
    }

    onEditRoleChange(roleId: string): void {
        const isDev = this.roles().find(r => r.id === roleId)?.name === 'Developer';
        this.editRoleIsDeveloper.set(isDev);
        // Clear teamId when switching to SuperAdmin
        if (!isDev) this.editForm.patchValue({ teamId: '' });
    }

    ngOnInit(): void {
        this.loadUsers();
        this.loadRoles();
        if (this.auth.hasPermission('teams.view')) this.loadTeams();
    }

    loadUsers(): void {
        this.loading.set(true);
        this.api.getUsers().subscribe({
            next: res => { if (res.success) this.users.set(res.data ?? []); this.loading.set(false); },
            error: () => this.loading.set(false)
        });
    }

    loadRoles(): void {
        this.api.getRoles().subscribe({
            next: res => { if (res.success) this.roles.set(res.data ?? []); }
        });
    }

    loadTeams(): void {
        this.api.getTeams().subscribe({
            next: res => { if (res.success) this.teams.set(res.data?.items ?? []); }
        });
    }

    // ── Create ────────────────────────────────────────────────────────────────
    openForm(): void {
        this.form.reset();
        this.createRoleIsDeveloper.set(false);
        this.showForm = true;
    }

    closeForm(): void { this.showForm = false; }

    submit(): void {
        if (this.form.invalid) return;
        this.saving.set(true);
        const v = this.form.value;
        const payload = {
            username: v.username!,
            email: v.email!,
            password: v.password!,
            fullName: v.fullName || undefined,
            roleId: v.roleId!,
            teamId: v.teamId || undefined
        };
        this.api.createUser(payload).subscribe({
            next: res => {
                if (res.success) { this.closeForm(); this.loadUsers(); }
                this.saving.set(false);
            },
            error: () => this.saving.set(false)
        });
    }

    // ── Edit (role + team) ────────────────────────────────────────────────────
    openEdit(user: AppUserListItem): void {
        this.editingUser.set(user);
        const isDev = this.roles().find(r => r.id === user.roleId)?.name === 'Developer';
        this.editRoleIsDeveloper.set(isDev);
        this.editForm.reset({
            roleId: user.roleId,
            teamId: user.teamId ?? ''
        });
    }

    closeEdit(): void { this.editingUser.set(null); }

    submitEdit(): void {
        const user = this.editingUser();
        if (!user || this.editForm.invalid) return;
        this.saving.set(true);
        const v = this.editForm.value;
        this.api.updateUserRole(user.id, v.roleId!, v.teamId || undefined).subscribe({
            next: res => {
                if (res.success && res.data) {
                    this.users.update(list =>
                        list.map((u: AppUserListItem) => u.id === user.id ? { ...u, ...res.data! } : u)
                    );
                    this.closeEdit();
                }
                this.saving.set(false);
            },
            error: () => this.saving.set(false)
        });
    }

    // ── Delete ────────────────────────────────────────────────────────────────
    delete(id: string): void {
        if (!confirm('Delete this user?')) return;
        this.api.deleteUser(id).subscribe({ next: () => this.loadUsers() });
    }

    formatDate(date?: string): string {
        if (!date) return '—';
        return new Date(date).toLocaleDateString();
    }
}
