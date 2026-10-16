import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiResponse, PagedResult,
  Team, CreateTeamRequest,
  SystemDto, CreateSystemRequest,
  EnvironmentDto, CreateEnvironmentRequest,
  EndpointListItem, EndpointDetail, HttpMethodType, ChangeStatus,
  AuthProfile, AuthProfileDetails, CreateAuthProfileRequest, TestAuthProfileResult,
  AppNotification,
  SyncResult, SyncLog, SyncSchedule, EnvironmentSyncStatus,
  SwaggerSourceDto, CreateSwaggerSourceRequest,
  RunRequestPayload, RunRequestResult, RequestHistoryItem,
  ChangeHistoryItem, GeneratedCode, DashboardStats,
  UserProfile, UpdateProfileRequest, ChangePasswordRequest,
  ShareFavoritesRequest,
  AppUserListItem, AppRole, CreateUserRequest,
  TeamPublicItem,
  EmbeddedSavedTest, SaveEmbeddedTestRequest,
  ApiStandardDto, CreateStandardRequest,
  ApiStandardRuleDto, CreateRuleRequest,
  ApiStandardAssignmentDto, CreateAssignmentRequest,
  ValidationRunDto, RunValidationRequest,
  ValidationResultDto, ValidationStatus, ValidationSeverity,
  ComplianceReportDto, EndpointComplianceDto
} from '../models/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // ── Public (no auth) ──────────────────────────────────────────────────────
  getPublicTeams(): Observable<ApiResponse<TeamPublicItem[]>> {
    return this.http.get<ApiResponse<TeamPublicItem[]>>(`${this.base}/teams/public`);
  }

  // ── Teams ─────────────────────────────────────────────────────────────────
  getTeams(search?: string, page = 1, pageSize = 20): Observable<ApiResponse<PagedResult<Team>>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    return this.http.get<ApiResponse<PagedResult<Team>>>(`${this.base}/teams`, { params });
  }
  getTeam(id: string): Observable<ApiResponse<Team>> {
    return this.http.get<ApiResponse<Team>>(`${this.base}/teams/${id}`);
  }
  createTeam(data: CreateTeamRequest): Observable<ApiResponse<Team>> {
    return this.http.post<ApiResponse<Team>>(`${this.base}/teams`, data);
  }
  updateTeam(id: string, data: CreateTeamRequest): Observable<ApiResponse<Team>> {
    return this.http.put<ApiResponse<Team>>(`${this.base}/teams/${id}`, data);
  }
  deleteTeam(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/teams/${id}`);
  }

  // ── Systems ───────────────────────────────────────────────────────────────
  getSystems(teamId?: string, search?: string, page = 1, pageSize = 20): Observable<ApiResponse<PagedResult<SystemDto>>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (teamId) params = params.set('teamId', teamId);
    if (search) params = params.set('search', search);
    return this.http.get<ApiResponse<PagedResult<SystemDto>>>(`${this.base}/systems`, { params });
  }
  getSystem(id: string): Observable<ApiResponse<SystemDto>> {
    return this.http.get<ApiResponse<SystemDto>>(`${this.base}/systems/${id}`);
  }
  createSystem(data: CreateSystemRequest): Observable<ApiResponse<SystemDto>> {
    return this.http.post<ApiResponse<SystemDto>>(`${this.base}/systems`, data);
  }
  updateSystem(id: string, data: CreateSystemRequest): Observable<ApiResponse<SystemDto>> {
    return this.http.put<ApiResponse<SystemDto>>(`${this.base}/systems/${id}`, data);
  }
  deleteSystem(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/systems/${id}`);
  }

  // ── Environments ──────────────────────────────────────────────────────────
  getEnvironments(systemId?: string): Observable<ApiResponse<PagedResult<EnvironmentDto>>> {
    let params = new HttpParams().set('pageSize', 100);
    if (systemId) params = params.set('systemId', systemId);
    return this.http.get<ApiResponse<PagedResult<EnvironmentDto>>>(`${this.base}/environments`, { params });
  }
  getEnvironment(id: string): Observable<ApiResponse<EnvironmentDto>> {
    return this.http.get<ApiResponse<EnvironmentDto>>(`${this.base}/environments/${id}`);
  }
  createEnvironment(data: CreateEnvironmentRequest): Observable<ApiResponse<EnvironmentDto>> {
    return this.http.post<ApiResponse<EnvironmentDto>>(`${this.base}/environments`, data);
  }
  updateEnvironment(id: string, data: Omit<CreateEnvironmentRequest, 'systemId'>): Observable<ApiResponse<EnvironmentDto>> {
    return this.http.put<ApiResponse<EnvironmentDto>>(`${this.base}/environments/${id}`, data);
  }
  deleteEnvironment(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/environments/${id}`);
  }

  // ── Swagger Sources ────────────────────────────────────────────────
  getSwaggerSources(environmentId: string): Observable<ApiResponse<SwaggerSourceDto[]>> {
    return this.http.get<ApiResponse<SwaggerSourceDto[]>>(`${this.base}/environments/${environmentId}/swagger-sources`);
  }
  createSwaggerSource(environmentId: string, data: CreateSwaggerSourceRequest): Observable<ApiResponse<SwaggerSourceDto>> {
    return this.http.post<ApiResponse<SwaggerSourceDto>>(`${this.base}/environments/${environmentId}/swagger-sources`, data);
  }
  updateSwaggerSource(environmentId: string, id: string, data: CreateSwaggerSourceRequest): Observable<ApiResponse<SwaggerSourceDto>> {
    return this.http.put<ApiResponse<SwaggerSourceDto>>(`${this.base}/environments/${environmentId}/swagger-sources/${id}`, data);
  }
  deleteSwaggerSource(environmentId: string, id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/environments/${environmentId}/swagger-sources/${id}`);
  }
  syncSwaggerSource(environmentId: string, sourceId: string): Observable<ApiResponse<SyncResult>> {
    return this.http.post<ApiResponse<SyncResult>>(`${this.base}/swaggersync/${environmentId}/sync/${sourceId}`, {});
  }

  // ── Swagger Sync ──────────────────────────────────────────────────────────
  syncSwagger(environmentId: string): Observable<ApiResponse<SyncResult>> {
    return this.http.post<ApiResponse<SyncResult>>(`${this.base}/swaggersync/${environmentId}/sync`, {});
  }
  getSyncLogs(environmentId: string): Observable<ApiResponse<PagedResult<SyncLog>>> {
    return this.http.get<ApiResponse<PagedResult<SyncLog>>>(`${this.base}/swaggersync/${environmentId}/logs`);
  }
  getSyncSchedule(): Observable<ApiResponse<SyncSchedule>> {
    return this.http.get<ApiResponse<SyncSchedule>>(`${this.base}/swaggersync/schedule`);
  }
  updateSyncSchedule(data: SyncSchedule): Observable<ApiResponse<SyncSchedule>> {
    return this.http.put<ApiResponse<SyncSchedule>>(`${this.base}/swaggersync/schedule`, data);
  }
  triggerAllSync(): Observable<ApiResponse<string>> {
    return this.http.post<ApiResponse<string>>(`${this.base}/swaggersync/run-all`, {});
  }
  getAllSyncStatus(): Observable<ApiResponse<EnvironmentSyncStatus[]>> {
    return this.http.get<ApiResponse<EnvironmentSyncStatus[]>>(`${this.base}/swaggersync/status`);
  }

  // ── Endpoints ─────────────────────────────────────────────────────────────
  getEndpoints(filters: {
    environmentId?: string; systemId?: string; teamId?: string;
    tag?: string; search?: string; method?: HttpMethodType; changeStatus?: ChangeStatus;
    swaggerSourceId?: string;
    favoritesOnly?: boolean;
    sharedWithMeOnly?: boolean;
    page?: number; pageSize?: number;
  } = {}): Observable<ApiResponse<PagedResult<EndpointListItem>>> {
    let params = new HttpParams()
      .set('page', filters.page ?? 1)
      .set('pageSize', filters.pageSize ?? 50);
    if (filters.environmentId) params = params.set('environmentId', filters.environmentId);
    if (filters.systemId) params = params.set('systemId', filters.systemId);
    if (filters.teamId) params = params.set('teamId', filters.teamId);
    if (filters.tag) params = params.set('tag', filters.tag);
    if (filters.search) params = params.set('search', filters.search);
    if (filters.method) params = params.set('method', filters.method);
    if (filters.changeStatus) params = params.set('changeStatus', filters.changeStatus);
    if (filters.swaggerSourceId) params = params.set('swaggerSourceId', filters.swaggerSourceId);
    if (filters.favoritesOnly) params = params.set('favoritesOnly', 'true');
    if (filters.sharedWithMeOnly) params = params.set('sharedWithMeOnly', 'true');
    return this.http.get<ApiResponse<PagedResult<EndpointListItem>>>(`${this.base}/endpoints`, { params });
  }

  // ── Favorites ─────────────────────────────────────────────────────────────
  toggleFavorite(endpointId: string): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/favorites/${endpointId}`, {});
  }
  shareFavorites(data: ShareFavoritesRequest): Observable<ApiResponse<number>> {
    return this.http.post<ApiResponse<number>>(`${this.base}/favorites/share`, data);
  }
  removeShared(endpointId: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/favorites/shared/${endpointId}`);
  }
  markSharedSeen(): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/favorites/shared/mark-seen`, {});
  }

  getEndpoint(id: string): Observable<ApiResponse<EndpointDetail>> {
    return this.http.get<ApiResponse<EndpointDetail>>(`${this.base}/endpoints/${id}`);
  }
  getEndpointTags(environmentId: string): Observable<ApiResponse<string[]>> {
    return this.http.get<ApiResponse<string[]>>(`${this.base}/endpoints/tags`, { params: new HttpParams().set('environmentId', environmentId) });
  }
  updateEndpointNotes(id: string, notes: string, usedInPages: string): Observable<ApiResponse<boolean>> {
    return this.http.patch<ApiResponse<boolean>>(`${this.base}/endpoints/${id}/notes`, { notes, usedInPages });
  }
  getChangeHistory(endpointId: string): Observable<ApiResponse<PagedResult<ChangeHistoryItem>>> {
    return this.http.get<ApiResponse<PagedResult<ChangeHistoryItem>>>(`${this.base}/endpoints/${endpointId}/change-history`);
  }
  exportDocumentation(request: {
    endpointIds?: string[];
    systemId?: string;
    environmentId?: string;
    tag?: string;
  }): Observable<ApiResponse<EndpointDetail[]>> {
    return this.http.post<ApiResponse<EndpointDetail[]>>(`${this.base}/export/documentation`, request);
  }

  // ── Auth Profiles ─────────────────────────────────────────────────────────
  getAuthProfile(id: string): Observable<ApiResponse<AuthProfileDetails>> {
    return this.http.get<ApiResponse<AuthProfileDetails>>(`${this.base}/authprofiles/${id}`);
  }
  getAuthProfiles(systemId?: string, environmentId?: string): Observable<ApiResponse<AuthProfile[]>> {
    let params = new HttpParams();
    if (systemId) params = params.set('systemId', systemId);
    if (environmentId) params = params.set('environmentId', environmentId);
    return this.http.get<ApiResponse<AuthProfile[]>>(`${this.base}/authprofiles`, { params });
  }
  createAuthProfile(data: CreateAuthProfileRequest): Observable<ApiResponse<AuthProfile>> {
    return this.http.post<ApiResponse<AuthProfile>>(`${this.base}/authprofiles`, data);
  }
  updateAuthProfile(id: string, data: CreateAuthProfileRequest): Observable<ApiResponse<AuthProfile>> {
    return this.http.put<ApiResponse<AuthProfile>>(`${this.base}/authprofiles/${id}`, data);
  }
  deleteAuthProfile(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/authprofiles/${id}`);
  }
  testAuthProfile(id: string): Observable<ApiResponse<TestAuthProfileResult>> {
    return this.http.post<ApiResponse<TestAuthProfileResult>>(`${this.base}/authprofiles/${id}/test`, {});
  }

  // ── Request Runner ────────────────────────────────────────────────────────
  runRequest(payload: RunRequestPayload): Observable<ApiResponse<RunRequestResult>> {
    return this.http.post<ApiResponse<RunRequestResult>>(`${this.base}/requestrunner/run`, payload);
  }
  getRequestHistory(endpointId: string): Observable<ApiResponse<PagedResult<RequestHistoryItem>>> {
    return this.http.get<ApiResponse<PagedResult<RequestHistoryItem>>>(`${this.base}/requestrunner/history/${endpointId}`);
  }

  // ── Code Generation ───────────────────────────────────────────────────────
  generateTypeScript(endpointId: string): Observable<ApiResponse<GeneratedCode>> {
    return this.http.get<ApiResponse<GeneratedCode>>(`${this.base}/codegeneration/${endpointId}/typescript`);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  getDashboardStats(): Observable<ApiResponse<DashboardStats>> {
    return this.http.get<ApiResponse<DashboardStats>>(`${this.base}/dashboard/stats`);
  }

  // ── User Profile ──────────────────────────────────────────────────────────
  getProfile(): Observable<ApiResponse<UserProfile>> {
    return this.http.get<ApiResponse<UserProfile>>(`${this.base}/auth/profile`);
  }
  updateProfile(data: UpdateProfileRequest): Observable<ApiResponse<UserProfile>> {
    return this.http.put<ApiResponse<UserProfile>>(`${this.base}/auth/profile`, data);
  }
  changePassword(data: ChangePasswordRequest): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/auth/change-password`, data);
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  getUsers(): Observable<ApiResponse<AppUserListItem[]>> {
    return this.http.get<ApiResponse<AppUserListItem[]>>(`${this.base}/users`);
  }
  getRoles(): Observable<ApiResponse<AppRole[]>> {
    return this.http.get<ApiResponse<AppRole[]>>(`${this.base}/users/roles`);
  }
  createUser(data: CreateUserRequest): Observable<ApiResponse<AppUserListItem>> {
    return this.http.post<ApiResponse<AppUserListItem>>(`${this.base}/users`, data);
  }
  deleteUser(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/users/${id}`);
  }
  updateUserRole(id: string, roleId: string, teamId?: string): Observable<ApiResponse<AppUserListItem>> {
    return this.http.patch<ApiResponse<AppUserListItem>>(`${this.base}/users/${id}/role`, { roleId, teamId: teamId || null });
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications(): Observable<ApiResponse<AppNotification[]>> {
    return this.http.get<ApiResponse<AppNotification[]>>(`${this.base}/notifications`);
  }
  markAllNotificationsRead(): Observable<ApiResponse<boolean>> {
    return this.http.post<ApiResponse<boolean>>(`${this.base}/notifications/mark-all-read`, {});
  }
  markNotificationRead(id: string): Observable<ApiResponse<boolean>> {
    return this.http.patch<ApiResponse<boolean>>(`${this.base}/notifications/${id}/read`, {});
  }

  // ── Embedded Saved Tests ──────────────────────────────────────────────────
  getEmbeddedTests(): Observable<ApiResponse<EmbeddedSavedTest[]>> {
    return this.http.get<ApiResponse<EmbeddedSavedTest[]>>(`${this.base}/embeddedtests`);
  }
  saveEmbeddedTest(data: SaveEmbeddedTestRequest): Observable<ApiResponse<EmbeddedSavedTest>> {
    return this.http.post<ApiResponse<EmbeddedSavedTest>>(`${this.base}/embeddedtests`, data);
  }
  updateEmbeddedTest(id: string, data: SaveEmbeddedTestRequest): Observable<ApiResponse<EmbeddedSavedTest>> {
    return this.http.put<ApiResponse<EmbeddedSavedTest>>(`${this.base}/embeddedtests/${id}`, data);
  }
  deleteEmbeddedTest(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/embeddedtests/${id}`);
  }

  // ── Governance: Standards ─────────────────────────────────────────────────
  getStandards(search?: string, isActive?: boolean, page = 1, pageSize = 20): Observable<ApiResponse<PagedResult<ApiStandardDto>>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    if (isActive !== undefined) params = params.set('isActive', isActive);
    return this.http.get<ApiResponse<PagedResult<ApiStandardDto>>>(`${this.base}/governance/standards`, { params });
  }
  getStandard(id: string): Observable<ApiResponse<ApiStandardDto>> {
    return this.http.get<ApiResponse<ApiStandardDto>>(`${this.base}/governance/standards/${id}`);
  }
  createStandard(data: CreateStandardRequest): Observable<ApiResponse<ApiStandardDto>> {
    return this.http.post<ApiResponse<ApiStandardDto>>(`${this.base}/governance/standards`, data);
  }
  updateStandard(id: string, data: CreateStandardRequest): Observable<ApiResponse<ApiStandardDto>> {
    return this.http.put<ApiResponse<ApiStandardDto>>(`${this.base}/governance/standards/${id}`, data);
  }
  deleteStandard(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/governance/standards/${id}`);
  }

  // ── Governance: Rules ─────────────────────────────────────────────────────
  getRules(standardId: string, isActive?: boolean): Observable<ApiResponse<ApiStandardRuleDto[]>> {
    let params = new HttpParams();
    if (isActive !== undefined) params = params.set('isActive', isActive);
    return this.http.get<ApiResponse<ApiStandardRuleDto[]>>(`${this.base}/governance/standards/${standardId}/rules`, { params });
  }
  createRule(standardId: string, data: CreateRuleRequest): Observable<ApiResponse<ApiStandardRuleDto>> {
    return this.http.post<ApiResponse<ApiStandardRuleDto>>(`${this.base}/governance/standards/${standardId}/rules`, data);
  }
  updateRule(id: string, data: CreateRuleRequest): Observable<ApiResponse<ApiStandardRuleDto>> {
    return this.http.put<ApiResponse<ApiStandardRuleDto>>(`${this.base}/governance/rules/${id}`, data);
  }
  deleteRule(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/governance/rules/${id}`);
  }

  // ── Governance: Assignments ───────────────────────────────────────────────
  getAssignments(standardId: string): Observable<ApiResponse<ApiStandardAssignmentDto[]>> {
    return this.http.get<ApiResponse<ApiStandardAssignmentDto[]>>(`${this.base}/governance/standards/${standardId}/assignments`);
  }
  createAssignment(standardId: string, data: CreateAssignmentRequest): Observable<ApiResponse<ApiStandardAssignmentDto>> {
    return this.http.post<ApiResponse<ApiStandardAssignmentDto>>(`${this.base}/governance/standards/${standardId}/assignments`, data);
  }
  removeAssignment(id: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/governance/assignments/${id}`);
  }

  // ── Governance: Validation ────────────────────────────────────────────────
  runValidation(data: RunValidationRequest): Observable<ApiResponse<ValidationRunDto>> {
    return this.http.post<ApiResponse<ValidationRunDto>>(`${this.base}/governance/validate`, data);
  }
  deleteValidationRun(runId: string): Observable<ApiResponse<boolean>> {
    return this.http.delete<ApiResponse<boolean>>(`${this.base}/governance/runs/${runId}`);
  }
  getValidationRuns(standardId: string, page = 1, pageSize = 20): Observable<ApiResponse<PagedResult<ValidationRunDto>>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<ApiResponse<PagedResult<ValidationRunDto>>>(`${this.base}/governance/standards/${standardId}/runs`, { params });
  }
  getValidationResults(runId: string, status?: ValidationStatus, severity?: ValidationSeverity, page = 1, pageSize = 50): Observable<ApiResponse<PagedResult<ValidationResultDto>>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (status) params = params.set('status', status);
    if (severity) params = params.set('severity', severity);
    return this.http.get<ApiResponse<PagedResult<ValidationResultDto>>>(`${this.base}/governance/runs/${runId}/results`, { params });
  }
  getComplianceReport(runId: string): Observable<ApiResponse<ComplianceReportDto>> {
    return this.http.get<ApiResponse<ComplianceReportDto>>(`${this.base}/governance/runs/${runId}/report`);
  }
  getEndpointCompliance(endpointId: string, page = 1): Observable<ApiResponse<EndpointComplianceDto>> {
    const params = new HttpParams().set('page', page);
    return this.http.get<ApiResponse<EndpointComplianceDto>>(`${this.base}/governance/endpoints/${endpointId}/compliance`, { params });
  }
}
