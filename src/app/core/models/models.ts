// ── Auth ──────────────────────────────────────────────────────────────────────
export interface LoginRequest { email: string; password: string; }
export interface RegisterRequest { username: string; email: string; password: string; fullName?: string; teamId?: string; }
export interface TeamPublicItem { id: string; name: string; }
export interface AuthResult { accessToken: string; refreshToken: string; username: string; role: string; userId: string; teamId?: string; teamName?: string; permissions: string[]; }
export interface UserProfile { id: string; username: string; email: string; fullName?: string; role: string; lastLoginAt?: string; createdAt: string; teamId?: string; teamName?: string; permissions: string[]; }
export interface UpdateProfileRequest { username: string; fullName?: string; }
export interface ChangePasswordRequest { currentPassword: string; newPassword: string; }

// ── Pagination ────────────────────────────────────────────────────────────────
export interface ApiResponse<T> { success: boolean; message?: string; data?: T; errors?: string[]; }
export interface PagedResult<T> { items: T[]; totalCount: number; pageNumber: number; pageSize: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean; }

// ── Teams ─────────────────────────────────────────────────────────────────────
export interface Team { id: string; name: string; description?: string; contactEmail?: string; slackChannel?: string; systemCount: number; createdAt: string; }
export interface CreateTeamRequest { name: string; description?: string; contactEmail?: string; slackChannel?: string; }

// ── Systems ───────────────────────────────────────────────────────────────────
export interface SystemDto { id: string; teamId: string; teamName: string; name: string; description?: string; ownerName: string; ownerEmail?: string; ownerContact?: string; repositoryUrl?: string; environmentCount: number; createdAt: string; }
export interface CreateSystemRequest { teamId: string; name: string; description?: string; ownerName: string; ownerEmail?: string; ownerContact?: string; repositoryUrl?: string; }

// ── Environments ──────────────────────────────────────────────────────────────
export type EnvironmentType = 'Local' | 'Development' | 'Test' | 'Staging' | 'Production';
export type SyncStatus = 'Success' | 'Failed' | 'Partial';
export interface EnvironmentDto { id: string; systemId: string; systemName: string; name: string; environmentType: EnvironmentType; swaggerUrl?: string; baseUrl: string; isActive: boolean; endpointCount: number; lastSyncedAt?: string; lastSyncStatus?: SyncStatus; createdAt: string; }
export interface CreateEnvironmentRequest { systemId: string; name: string; environmentType: EnvironmentType; swaggerUrl?: string; baseUrl: string; isActive: boolean; }

// ── Endpoints ─────────────────────────────────────────────────────────────────
export type HttpMethodType = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
export type ChangeStatus = 'New' | 'Deleted' | 'Modified' | 'Unchanged';
export type ParameterLocation = 'Query' | 'Path' | 'Header' | 'Cookie';

export interface EndpointListItem {
  id: string; path: string; method: HttpMethodType; tag?: string; summary?: string;
  isDeprecated: boolean; changeStatus: ChangeStatus; lastSyncedAt?: string;
  environmentId: string; environmentName: string; systemId: string; systemName: string;
  teamId: string; teamName: string; isFavorite: boolean; isShared: boolean; isNew: boolean;
}

export interface ParameterDto { id: string; name: string; location: ParameterLocation; description?: string; required: boolean; schema?: string; example?: string; }
export interface HeaderDto { id: string; name: string; description?: string; required: boolean; schema?: string; defaultValue?: string; }
export interface RequestBodyDto { id: string; contentType: string; schema?: string; example?: string; required: boolean; }
export interface ResponseDto { id: string; statusCode: string; description?: string; contentType?: string; schema?: string; example?: string; }

export interface EndpointDetail {
  id: string; path: string; method: HttpMethodType; tag?: string; summary?: string;
  description?: string; operationId?: string; isDeprecated: boolean; changeStatus: ChangeStatus;
  lastSyncedAt?: string; environmentId: string; environmentName: string; baseUrl: string;
  systemId: string; systemName: string; teamId: string; teamName: string;
  parameters: ParameterDto[]; headers: HeaderDto[]; requestBodies: RequestBodyDto[]; responses: ResponseDto[];
  defaultAuthProfileId?: string; notes?: string; usedInPages?: string;
}

// ── Auth Profiles ─────────────────────────────────────────────────────────────
export type AuthProfileType = 'NoAuth' | 'BearerToken' | 'ApiKey' | 'BasicAuth' | 'CustomHeader' | 'AutoLoginToken';
export interface AuthProfile { id: string; name: string; description?: string; type: AuthProfileType; systemId?: string; environmentId?: string; isDefault: boolean; preAuthProfileId?: string; preAuthProfileName?: string; createdAt: string; }
export interface AuthProfileDetails extends AuthProfile { apiKeyHeaderName?: string; customHeaderName?: string; loginUrl?: string; loginMethod?: string; loginRequestBodyTemplate?: string; tokenJsonPath?: string; tokenPrefix?: string; tokenExpirySeconds?: number; extraHeaders?: string; }
export interface CreateAuthProfileRequest { name: string; description?: string; type: AuthProfileType; systemId?: string; environmentId?: string; token?: string; apiKeyHeaderName?: string; apiKeyValue?: string; username?: string; password?: string; customHeaderName?: string; customHeaderValue?: string; loginUrl?: string; loginMethod?: string; loginRequestBodyTemplate?: string; tokenJsonPath?: string; tokenPrefix?: string; tokenExpirySeconds?: number; preAuthProfileId?: string; isDefault: boolean; }
export interface TestAuthProfileResult { isSuccess: boolean; generatedHeaders: Record<string, string>; extractedToken?: string; loginResponseBody?: string; loginStatusCode?: number; loginResponseTimeMs?: number; error?: string; }

// ── Notifications ─────────────────────────────────────────────────────────────
export interface AppNotification { id: string; message: string; type: string; isRead: boolean; createdAt: string; relatedEntityId?: string | null; }

// ── Swagger Sources ──────────────────────────────────────────────────────────
export interface SwaggerSourceDto { id: string; environmentId: string; label: string; url: string; baseUrl: string; isActive: boolean; createdAt: string; }
export interface CreateSwaggerSourceRequest { label: string; url: string; baseUrl: string; isActive: boolean; }

// ── Swagger Sync ──────────────────────────────────────────────────────────────
export interface SyncResult { syncLogId: string; status: SyncStatus; totalEndpoints: number; newEndpoints: number; modifiedEndpoints: number; deletedEndpoints: number; error?: string; syncedAt: string; }
export interface SyncLog { id: string; environmentId: string; environmentName: string; status: SyncStatus; totalEndpoints: number; newEndpoints: number; modifiedEndpoints: number; deletedEndpoints: number; errorMessage?: string; swaggerVersion?: string; syncedAt: string; }
export interface SyncSchedule { isEnabled: boolean; cronExpression: string; label: string; }
export interface EnvironmentSyncStatus { environmentId: string; environmentName: string; systemName: string; swaggerUrl?: string; swaggerSourceId?: string; lastStatus?: SyncStatus; newEndpoints?: number; modifiedEndpoints?: number; deletedEndpoints?: number; totalEndpoints?: number; lastSyncedAt?: string; errorMessage?: string; }

// ── Favorites ────────────────────────────────────────────────────────────────
export interface ShareFavoritesRequest { targetUser?: string; teamIds?: string[]; shareWithMyTeam?: boolean; endpointIds?: string[]; }

// ── Request Runner ────────────────────────────────────────────────────────────
export interface RunRequestPayload { endpointId: string; authProfileId?: string; headers: Record<string, string>; queryParams: Record<string, string>; routeParams: Record<string, string>; body?: string; baseUrlOverride?: string; }
export interface RunRequestResult { isSuccess: boolean; statusCode?: number; responseHeaders: Record<string, string>; responseBody?: string; responseTimeMs: number; error?: string; historyId?: string; }
export interface RequestHistoryItem { id: string; method: string; url: string; statusCode?: number; responseTimeMs?: number; isSuccess: boolean; createdAt: string; }

// ── Change History ────────────────────────────────────────────────────────────
export interface ChangeHistoryItem { id: string; changeType: ChangeStatus; previousSnapshot?: string; newSnapshot?: string; changeSummary?: string; createdAt: string; }

// ── Code Generation ───────────────────────────────────────────────────────────
export interface GeneratedCode { typeScriptInterfaces: string; angularServiceMethod: string; }

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface DashboardStats { totalTeams: number; totalSystems: number; totalEnvironments: number; totalEndpoints: number; uniqueEndpoints: number; newEndpoints: number; modifiedEndpoints: number; deletedEndpoints: number; brokenSwaggerUrls: number; endpointsByEnvironment: EnvironmentEndpointsStatsDto[]; recentSyncs: RecentSync[]; }
export interface SwaggerSourceStats { sourceId?: string; label?: string; url?: string; totalEndpoints: number; }
export interface EnvironmentEndpointsStatsDto { environmentId: string; environmentName: string; systemId: string; systemName: string; totalEndpoints: number; swaggerSources: SwaggerSourceStats[]; }
export interface RecentSync { environmentId: string; environmentName: string; systemName: string; swaggerSourceLabel?: string; swaggerSourceUrl?: string; status: SyncStatus; syncedAt: string; errorMessage?: string; }

export interface AppUserListItem { id: string; username: string; email: string; fullName?: string; role: string; roleId: string; teamId?: string; teamName?: string; lastLoginAt?: string; createdAt: string; }
export interface AppRole { id: string; name: string; }
export interface CreateUserRequest { username: string; email: string; password: string; fullName?: string; roleId: string; teamId?: string; }

// ── Embedded Saved Tests ──────────────────────────────────────────────────────
export interface EmbeddedSavedTest { id: string; name: string; method: string; url: string; token: string; body?: string; createdAt: string; }
export interface SaveEmbeddedTestRequest { name: string; method: string; url: string; token: string; body?: string; }

// ── Governance ────────────────────────────────────────────────────────────────
export type RuleType = 'Regex' | 'RequiredField' | 'ResponseSchema' | 'HttpMethod' | 'StatusCode' | 'CustomExpression' | 'Pagination';
export type RuleTarget = 'Path' | 'Method' | 'Summary' | 'Description' | 'Tag' | 'OperationId' | 'ResponseSchema' | 'StatusCode' | 'Parameters' | 'Security' | 'Headers';
export type ValidationSeverity = 'Info' | 'Warning' | 'Error' | 'Critical';
export type ValidationStatus = 'Passed' | 'Failed' | 'Skipped';
export type AssignmentScope = 'Team' | 'System' | 'Environment' | 'SwaggerSource';
export type ValidationRunStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';

export interface ApiStandardDto { id: string; name: string; description?: string; isActive: boolean; ruleCount: number; assignmentCount: number; createdAt: string; updatedAt?: string; }
export interface CreateStandardRequest { name: string; description?: string; isActive: boolean; }

export interface ApiStandardRuleDto { id: string; standardId: string; ruleName: string; ruleDescription?: string; ruleType: RuleType; target: RuleTarget; expression?: string; severity: ValidationSeverity; errorMessage: string; suggestedFix?: string; isActive: boolean; createdAt: string; }
export interface CreateRuleRequest { ruleName: string; ruleDescription?: string; ruleType: RuleType; target: RuleTarget; expression?: string; severity: ValidationSeverity; errorMessage: string; suggestedFix?: string; isActive: boolean; }

export interface ApiStandardAssignmentDto { id: string; standardId: string; standardName: string; scope: AssignmentScope; scopeId: string; scopeName: string; }
export interface CreateAssignmentRequest { scope: AssignmentScope; scopeId: string; }

export interface ValidationRunDto { id: string; standardId: string; standardName: string; status: ValidationRunStatus; totalEndpoints: number; passedEndpoints: number; failedEndpoints: number; overallComplianceScore: number; createdAt: string; completedAt?: string; errorMessage?: string; }
export interface RunValidationRequest { standardId: string; scopeTeamId?: string; scopeSystemId?: string; scopeEnvironmentId?: string; scopeSwaggerSourceId?: string; scopeEndpointId?: string; }

export interface ValidationResultDto { id: string; endpointId: string; endpointPath: string; endpointMethod: string; endpointTag?: string; ruleId: string; ruleName: string; ruleType: RuleType; status: ValidationStatus; severity: ValidationSeverity; message?: string; suggestedFix?: string; }

export interface SeverityBreakdownDto { severity: ValidationSeverity; failedCount: number; }
export interface EndpointComplianceSummaryDto { endpointId: string; path: string; method: string; tag?: string; complianceScore: number; passedRules: number; failedRules: number; skippedRules: number; errors: number; warnings: number; violations: ValidationResultDto[]; }
export interface ComplianceReportDto { runId: string; standardId: string; standardName: string; runDate: string; totalEndpoints: number; passedEndpoints: number; failedEndpoints: number; overallScore: number; severityBreakdown: SeverityBreakdownDto[]; endpointSummaries: EndpointComplianceSummaryDto[]; }

export interface EndpointRunComplianceDto { runId: string; standardId: string; standardName: string; complianceScore: number; passedRules: number; failedRules: number; runDate: string; results: ValidationResultDto[]; }
export interface EndpointComplianceDto { endpointId: string; path: string; method: string; tag?: string; runHistory: EndpointRunComplianceDto[]; }
