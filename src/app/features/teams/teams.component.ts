import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { CreateTeamRequest, Team } from '../../core/models/models';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { apiErrorKey } from '../../core/models/organization';

@Component({
    selector: 'app-teams',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, LoadingComponent, TranslatePipe],
    templateUrl: './teams.component.html',
    styleUrls: ['./teams.component.scss']
})
export class TeamsComponent implements OnInit {
    private readonly api = inject(ApiService);
    readonly auth = inject(AuthService);
    readonly organization = inject(OrganizationContextService);
    readonly readError = signal<string | null>(null);
    readonly mutationError = signal<string | null>(null);
    private readonly fb = inject(FormBuilder);
    private readonly router = inject(Router);

    readonly isWorkbench = this.router.url.startsWith('/workbench');
    readonly teams = signal<Team[]>([]);
    readonly loading = signal(true);
    readonly saving = signal(false);
    readonly deleting = signal(false);
    readonly selectedTeamId = signal<string | null>(null);
    readonly pendingDeleteId = signal<string | null>(null);
    readonly pageNumber = signal(1);
    readonly pageSize = 20;
    readonly totalCount = signal(0);
    readonly totalPages = signal(0);
    readonly searchControl = new FormControl('', { nonNullable: true });
    readonly skeletonRows = [0, 1, 2, 3, 4];
    readonly systemsOnPage = computed(() => this.teams().reduce((total, team) => total + team.systemCount, 0));
    readonly selectedTeam = computed(() =>
        this.teams().find(team => team.id === this.selectedTeamId()) ?? null
    );
    showForm = false;
    editingId: string | null = null;

    readonly form = this.fb.nonNullable.group({
        name: ['', [Validators.required, Validators.maxLength(100)]],
        description: [''],
        contactEmail: ['', Validators.email],
        slackChannel: ['']
    });

    ngOnInit(): void { this.loadTeams(); }

    loadTeams(): void {
        this.readError.set(null);
        this.loading.set(true);
        this.api.getTeams(this.safeSearchTerm(), this.pageNumber(), this.pageSize).subscribe({
            next: res => {
                if (res.success && res.data) {
                    this.teams.set(res.data.items);
                    this.totalCount.set(res.data.totalCount);
                    this.totalPages.set(res.data.totalPages);
                    if (!res.data.items.length && this.pageNumber() > Math.max(1, res.data.totalPages)) {
                        this.pageNumber.set(Math.max(1, res.data.totalPages));
                        this.loadTeams();
                        return;
                    }
                    if (!res.data.items.some(team => team.id === this.selectedTeamId())) {
                        this.selectedTeamId.set(this.isWorkbench ? res.data.items[0]?.id ?? null : null);
                    }
                } else {
                    this.teams.set([]);
                    this.totalCount.set(0);
                    this.totalPages.set(0);
                    this.readError.set('org.requestFailed');
                }
                this.loading.set(false);
            },
            error: (error: HttpErrorResponse) => {
                this.teams.set([]);
                this.totalCount.set(0);
                this.totalPages.set(0);
                this.readError.set(apiErrorKey(error.status));
                this.loading.set(false);
            }
        });
    }

    applySearch(): void {
        if (this.organization.structuralOnly()) return;
        this.pageNumber.set(1);
        this.selectedTeamId.set(null);
        this.loadTeams();
    }

    goToPage(page: number): void {
        if (page < 1 || page > this.totalPages() || page === this.pageNumber()) return;
        this.pageNumber.set(page);
        this.loadTeams();
    }

    selectTeam(team: Team): void { this.selectedTeamId.set(team.id); }
    trackTeam(_: number, team: Team): string { return team.id; }

    canManageTeams(): boolean {
        return this.organization.canMutate() && this.auth.hasPermission('teams.manage');
    }

    openForm(team?: Team): void {
        if (!this.canManage()) return;
        this.mutationError.set(null);
        this.editingId = team?.id ?? null;
        this.form.reset({ name: team?.name ?? '', description: team?.description ?? '', contactEmail: team?.contactEmail ?? '', slackChannel: team?.slackChannel ?? '' });
        this.showForm = true;
    }

    closeForm(): void {
        this.showForm = false;
        this.editingId = null;
        this.mutationError.set(null);
    }

    submit(): void {
        if (!this.canManage()) return;
        if (this.form.invalid) return;
        this.saving.set(true);
        this.mutationError.set(null);
        const payload: CreateTeamRequest = this.form.getRawValue();
        const obs = this.editingId
            ? this.api.updateTeam(this.editingId, payload)
            : this.api.createTeam(payload);
        obs.subscribe({
            next: () => {
                this.showForm = false;
                this.editingId = null;
                this.saving.set(false);
                this.loadTeams();
            },
            error: (error: HttpErrorResponse) => {
                this.mutationError.set(apiErrorKey(error.status));
                this.saving.set(false);
            }
        });
    }

    delete(id: string): void {
        if (!this.canManage()) return;
        if (this.isWorkbench) {
            this.pendingDeleteId.set(id);
            this.mutationError.set(null);
            return;
        }
        if (confirm('Delete this team?')) this.confirmDelete(id);
    }

    confirmDelete(id = this.pendingDeleteId()): void {
        if (!id || !this.canManage()) return;
        this.deleting.set(true);
        this.mutationError.set(null);
        this.api.deleteTeam(id).subscribe({
            next: () => {
                this.pendingDeleteId.set(null);
                this.deleting.set(false);
                this.loadTeams();
            },
            error: (error: HttpErrorResponse) => {
                this.mutationError.set(apiErrorKey(error.status));
                this.deleting.set(false);
            }
        });
    }

    private canManage(): boolean {
        return this.organization.requireMutation('teams.manage');
    }

    private safeSearchTerm(): string | undefined {
        return this.organization.structuralOnly() ? undefined : this.searchControl.value.trim() || undefined;
    }
}
