import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { ShellComponent } from './layout/shell/shell.component';
import { organizationGuard } from './core/guards/organization.guard';
import { managementPermissions } from './core/authorization/organization-navigation';
import { WorkbenchShellComponent } from './workbench/workbench-shell.component';
import { WorkbenchLandingComponent } from './workbench/workbench-landing.component';

export const routes: Routes = [
    {
        path: 'login',
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
    },
    {
        path: 'access-denied',
        canActivate: [authGuard],
        canActivateChild: [organizationGuard],
        children: [{
            path: '',
            data: { organizationOptional: true },
            loadComponent: () => import('./features/organizations/access-denied.component').then(m => m.AccessDeniedComponent)
        }]
    },
    {
        path: 'workbench',
        component: WorkbenchShellComponent,
        canActivate: [authGuard],
        canActivateChild: [organizationGuard],
        children: [
            { path: '', pathMatch: 'full', component: WorkbenchLandingComponent },
            {
                path: 'manage',
                data: { anyPermissions: managementPermissions, effect: 'Mutation' },
                loadComponent: () => import('./features/management/management.component').then(m => m.ManagementComponent)
            },
            {
                path: 'overview',
                data: { permission: 'endpoints.view', dashboard: true },
                loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
            },
            {
                path: 'teams',
                data: { permission: 'teams.view' },
                loadComponent: () => import('./features/teams/teams.component').then(m => m.TeamsComponent)
            },
            {
                path: 'systems',
                data: { permission: 'systems.view' },
                loadComponent: () => import('./features/systems/systems.component').then(m => m.SystemsComponent)
            },
            {
                path: 'environments',
                data: { permission: 'environments.view' },
                loadComponent: () => import('./features/environments/environments.component').then(m => m.EnvironmentsComponent)
            },
            {
                path: 'endpoints',
                data: { permission: 'endpoints.view' },
                loadComponent: () => import('./features/endpoints/endpoint-list/endpoint-list.component').then(m => m.EndpointListComponent)
            },
            {
                path: 'endpoints/:id',
                data: { permission: 'endpoints.view' },
                loadComponent: () => import('./features/endpoints/endpoint-detail/endpoint-detail.component').then(m => m.EndpointDetailComponent)
            },
            {
                path: 'endpoints/:id/run',
                data: { permission: 'endpoints.run' },
                loadComponent: () => import('./features/endpoints/endpoint-runner/endpoint-runner.component').then(m => m.EndpointRunnerComponent)
            },
            {
                path: 'endpoints/:id/history',
                data: { permission: 'endpoints.view', effect: 'CredentialAccess' },
                loadComponent: () => import('./features/endpoints/change-history/change-history.component').then(m => m.ChangeHistoryComponent)
            },
            {
                path: 'endpoints/:id/code',
                data: { permission: 'endpoints.view', effect: 'CredentialAccess' },
                loadComponent: () => import('./features/endpoints/code-generator/code-generator.component').then(m => m.CodeGeneratorComponent)
            },
            {
                path: 'swagger',
                data: { permission: 'swaggersync.view' },
                loadComponent: () => import('./features/swagger-sync/swagger-sync.component').then(m => m.SwaggerSyncComponent)
            },
            {
                path: 'settings/members',
                data: { organizationOptional: true },
                loadComponent: () => import('./features/organizations/organizations.component').then(m => m.OrganizationsComponent)
            },
            {
                path: 'settings/management',
                data: { anyPermissions: managementPermissions, effect: 'Mutation' },
                loadComponent: () => import('./features/management/management.component').then(m => m.ManagementComponent)
            },
            {
                path: 'notifications',
                loadComponent: () => import('./features/notifications/notification-workspace.component').then(m => m.NotificationWorkspaceComponent)
            },
            {
                path: 'governance',
                data: { permission: 'governance.view' },
                loadComponent: () => import('./features/governance/governance-standards/governance-standards.component').then(m => m.GovernanceStandardsComponent)
            },
            {
                path: 'governance/standards/:id',
                data: { permission: 'governance.view' },
                loadComponent: () => import('./features/governance/governance-detail/governance-detail.component').then(m => m.GovernanceDetailComponent)
            },
            {
                path: 'governance/runs/:runId/report',
                data: { permission: 'governance.view' },
                loadComponent: () => import('./features/governance/compliance-report/compliance-report.component').then(m => m.ComplianceReportComponent)
            },
            {
                path: 'governance/validate',
                data: { permission: 'governance.run' },
                loadComponent: () => import('./features/governance/validation-runner/validation-runner.component').then(m => m.ValidationRunnerComponent)
            },
            { path: '**', redirectTo: '/workbench' }
        ]
    },
    {
        path: '',
        component: ShellComponent,
        canActivate: [authGuard],
        canActivateChild: [organizationGuard],
        children: [
            {
                path: 'organizations', data: { organizationOptional: true },
                loadComponent: () => import('./features/organizations/organizations.component').then(m => m.OrganizationsComponent)
            },
            {
                path: 'invitations/accept', data: { organizationOptional: true },
                loadComponent: () => import('./features/organizations/invitation-accept.component').then(m => m.InvitationAcceptComponent)
            },
            { path: '', redirectTo: 'start', pathMatch: 'full' },
            {
                path: 'start', data: { organizationOptional: true },
                loadComponent: () => import('./features/organizations/organization-selection.component').then(m => m.OrganizationSelectionComponent)
            },
            {
                path: 'management', data: { anyPermissions: managementPermissions, effect: 'Mutation' },
                loadComponent: () => import('./features/management/management.component').then(m => m.ManagementComponent)
            },
            {
                path: 'dashboard',
                data: { permission: 'endpoints.view', dashboard: true },
                loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
            },
            {
                path: 'teams',
                data: { permission: 'teams.view' },
                loadComponent: () => import('./features/teams/teams.component').then(m => m.TeamsComponent)
            },
            {
                path: 'systems',
                data: { permission: 'systems.view' },
                loadComponent: () => import('./features/systems/systems.component').then(m => m.SystemsComponent)
            },
            {
                path: 'environments',
                data: { permission: 'environments.view' },
                loadComponent: () => import('./features/environments/environments.component').then(m => m.EnvironmentsComponent)
            },
            {
                path: 'endpoints',
                data: { permission: 'endpoints.view' },
                loadComponent: () => import('./features/endpoints/endpoint-list/endpoint-list.component').then(m => m.EndpointListComponent)
            },
            {
                path: 'endpoints/:id',
                data: { permission: 'endpoints.view' },
                loadComponent: () => import('./features/endpoints/endpoint-detail/endpoint-detail.component').then(m => m.EndpointDetailComponent)
            },
            {
                path: 'endpoints/:id/run',
                data: { permission: 'endpoints.run' },
                loadComponent: () => import('./features/endpoints/endpoint-runner/endpoint-runner.component').then(m => m.EndpointRunnerComponent)
            },
            {
                path: 'endpoints/:id/history',
                data: { permission: 'endpoints.view', effect: 'CredentialAccess' },
                loadComponent: () => import('./features/endpoints/change-history/change-history.component').then(m => m.ChangeHistoryComponent)
            },
            {
                path: 'endpoints/:id/code',
                data: { permission: 'endpoints.view', effect: 'CredentialAccess' },
                loadComponent: () => import('./features/endpoints/code-generator/code-generator.component').then(m => m.CodeGeneratorComponent)
            },
            {
                path: 'auth-profiles',
                data: { permission: 'authprofiles.view' },
                loadComponent: () => import('./features/auth-profiles/auth-profiles.component').then(m => m.AuthProfilesComponent)
            },
            {
                path: 'swagger-sync',
                data: { permission: 'swaggersync.view' },
                loadComponent: () => import('./features/swagger-sync/swagger-sync.component').then(m => m.SwaggerSyncComponent)
            },
            {
                path: 'users',
                data: { organizationOptional: true, permission: 'users.manage' },
                loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent)
            },
            {
                path: 'profile',
                data: { organizationOptional: true },
                loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent)
            },
            {
                path: 'embedded-test',
                data: { permission: 'endpoints.run' },
                loadComponent: () => import('./features/embedded-test/embedded-test.component').then(m => m.EmbeddedTestComponent)
            },
            {
                path: 'governance',
                data: { permission: 'governance.view' },
                loadComponent: () => import('./features/governance/governance-standards/governance-standards.component').then(m => m.GovernanceStandardsComponent)
            },
            {
                path: 'governance/standards/:id',
                data: { permission: 'governance.view' },
                loadComponent: () => import('./features/governance/governance-detail/governance-detail.component').then(m => m.GovernanceDetailComponent)
            },
            {
                path: 'governance/runs/:runId/report',
                data: { permission: 'governance.view' },
                loadComponent: () => import('./features/governance/compliance-report/compliance-report.component').then(m => m.ComplianceReportComponent)
            },
            {
                path: 'governance/validate',
                data: { permission: 'governance.run' },
                loadComponent: () => import('./features/governance/validation-runner/validation-runner.component').then(m => m.ValidationRunnerComponent)
            }
        ]
    },
    { path: '**', redirectTo: '/start' }
];
