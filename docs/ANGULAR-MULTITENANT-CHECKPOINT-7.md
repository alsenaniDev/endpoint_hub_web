# Checkpoint 7 - Angular organization support

## Outcome and approved scope

Implemented centralized Angular organization support and the separately approved
minimal **read-only** backend contract. Backend authorization remains authoritative.

No SQL Server connection was opened, no backend host was started, and no database
mutation/migration/permission grant was performed in this checkpoint. Frontend
HTTP tests use HttpTestingController; backend tests are isolated tests. Nothing
connected to or modified the original TWKEndpointsHub database.

Organization creation/editing, membership changes and the invitation lifecycle
remain explicitly unavailable. Their absence is not disguised as an empty
successful API response. This limitation was approved before implementation.

## 1. Organization state architecture

[OrganizationContextService](../src/app/core/services/organization-context.service.ts)
owns all organization identity and membership state:

- Readonly signals: organizations, activeOrganization, activeOrganizationId,
  membership, permissions, canManageUsers, loading, error and request feedback.
- Published objects, membership roles and permission arrays are cloned/frozen.
- Initialization discovers live memberships, then validates the active membership
  before allowing tenant views to render.
- User-specific localStorage selection is accepted only when it matches a
  returned active membership. Otherwise the first valid backend-returned
  organization is selected. An empty list never invents an organization.
- Failed/revoked context clears the active membership and persisted selection.
- Storage failure is surfaced while retaining a validated in-memory selection.
- A request generation rejects superseded responses; an observable boundary
  cancels old tenant HTTP subscriptions.
- A render epoch forces routed tenant components to be destroyed/recreated.
  This also works when the next context returns before change detection observes
  the intermediate loading state.

Components do not maintain their own organization selection. Directory rows,
feature lists and forms remain view-local and are reset at the central boundary.

## 2. API interceptor and error handling

[authInterceptor](../src/app/core/interceptors/auth.interceptor.ts):

- Recognizes only the configured API origin/path.
- Automatically attaches the current token and central X-Organization-Id to
  tenant requests.
- Deletes caller-provided organization headers before assigning the central ID.
- Identity, platform Users, public Teams and organization discovery requests
  are exempt from the required organization header.
- Missing tenant context fails locally with 400, not an unscoped request.
- Cancels old tenant subscriptions and excludes superseded responses.
- Does not automatically send bearer credentials to assets/other origins.
- Does not retry denied writes.

| Backend status | Frontend handling |
|---|---|
| 401 | Clear session/context and navigate to login |
| 400 | Invalid organization context or request feedback |
| 403 | Explicit forbidden feedback; revalidate current membership/permissions |
| 404 | Resource unavailable/not visible, without treating 403 as 404 |
| 409 | Explicit deferred-operation feedback |

A 403 with still-valid membership preserves context and refreshes permission
hints. A failed current-membership check clears tenant state. No background
retry loop is triggered by an unchanged permission response. Changed role/
permission context increments the render epoch.

This is UX handling, not frontend authorization authority. The backend still
checks every request.

## 3. Organization switcher and shell

[OrganizationSwitcherComponent](../src/app/shared/components/organization-switcher/organization-switcher.component.ts)
shows organization names/types/current selection and links to settings.
IDs are used as option values/request context, not visible labels.

The desktop header and mobile shell both expose the switcher. Switching discards
the old resource route/query filters, cancels tenant requests, clears caches,
waits for current-membership validation and reloads scoped data.

[ShellComponent](../src/app/layout/shell/shell.component.ts) uses the central
epoch as its routed-view key. Identity/platform/settings/error routes can render
without an organization; ordinary tenant views cannot.

The sidebar shows the actual membership role, not the login's legacy role.

## 4. Approved read-only backend contract

The audit found no organization controllers/handlers in the existing backend.
The user approved adding only discovery/current context plus authorized
read-only members/roles.

[OrganizationsController](../../endpoint_hub_api/src/Api/Controllers/OrganizationsController.cs)
and
[OrganizationReadService](../../endpoint_hub_api/src/Application/Features/Organizations/OrganizationReadService.cs)
provide:

| Endpoint | Boundary and output |
|---|---|
| GET /api/organizations | Authenticated live actor; only its valid active memberships; live platform capability hint |
| GET /api/organizations/current | Required organization header/live membership; actual organization/member/role and effective tenant permission hints |
| GET /api/organizations/current/members | Required live membership; active members of that organization only |
| GET /api/organizations/current/roles | Required live membership; distinct organization-scoped roles used by its valid members only |

The member/role directory is readable by a valid active organization member;
no mutation authority is granted. It excludes deleted organizations/users/
members/roles, invalid role scopes and invalid/cross-organization member teams.
No password/token/platform flag is included in directory DTOs.

Discovery is the sole new header-independent action and uses an explicit action
metadata attribute. Current/member/role actions keep the normal tenant boundary.
Platform capability hints reuse the existing server users.manage evaluator.
No JWT role or permission authorization was added.

All four endpoints are GET-only. There is no SaveChanges call, role mutation,
new permission definition, role grant or schema change.

## 5. Settings, members, invitations and roles

[OrganizationsComponent](../src/app/features/organizations/organizations.component.ts)
provides:

- Available organizations and selection.
- Readonly organization name/type/current membership role.
- Active member directory: name, actual organization role and membership state.
- Roles used by active organization members, never the global role catalog.
- Reload, loading, empty and explicit error states.
- Prepared invitation section with disabled email/role/send controls and an
  explicit unsupported pending-list state.

[InvitationAcceptComponent](../src/app/features/organizations/invitation-accept.component.ts)
does not read/display invitation tokens or invent accepted/expired/invalid
statuses. It states that backend acceptance and status validation are unavailable.
Settings contain no platform role/permission/user-flag administration.

The role dropdown lists directory roles only. It is **not** claimed to be an
assignable invitation-role catalog and remains disabled.

## 6. Guards and existing features

[organizationGuard](../src/app/core/guards/organization.guard.ts) initializes
membership context for authenticated navigation, blocks missing/invalid context,
handles expired sessions, and uses server-returned hints for route UX.
It is installed on all shell children, with explicit identity/settings/platform
exceptions and required permission metadata.

[AuthService](../src/app/core/services/auth.service.ts) delegates permission
visibility to current organization/platform context. Stored/JWT/legacy grants
are no longer treated as tenant permission hints.
[PermissionDirective](../src/app/core/directives/permission.directive.ts)
centralizes additional action visibility.

| Feature | Organization integration |
|---|---|
| Teams | Existing ApiService calls inherit the central header; recreated view clears rows/forms |
| Systems | Same; allowed management hints come from current membership |
| Environments | Same; nested Swagger sources also inherit scope |
| Endpoints | Same; route/filter/selection/favorite/share state is recreated |
| AuthProfiles | Scoped API calls and guarded route; unavailable Owner action/navigation hidden |
| Swagger | Scoped reads; schedule fetch/card gated by manageschedule, avoiding the known Owner 403 |
| Governance | Scoped API; view/run route hints; centralized manage/run action visibility |
| Saved Tests | Scoped creator-private backend list; run-key execution/authoring/deletion actions hidden when ungranted |
| Favorites | Scoped requests; array/reference ownership remains enforced by backend |
| Notifications | Synchronous reset and scoped HTTP reload; no user-only realtime subscription |
| History | Scoped endpoint/request-history API calls and destroyed local view caches |
| Validation | Scoped API calls; run-route/action permission hints |

Endpoint sharing uses current membership team/teams.view hints, not a legacy
SuperAdmin name. Platform user UI uses the live users.manage capability hint.

Registration no longer offers/sends a tenant TeamId: the backend already rejects
that public assignment. New registration does not imply organization membership;
the empty-membership state handles it honestly.

## 7. Tests and builds

| Check | Result |
|---|---|
| Angular ChromeHeadless Jasmine/Karma tests | **34 passed, 0 failed** |
| Targeted backend organization/authorization tests | **59 passed, 0 failed** |
| Complete isolated backend authorization suite | **113 passed, 0 failed** |
| Angular development build | **Passed** |
| Backend API build | **Passed, 0 errors / 0 warnings** |

Frontend coverage includes loading, valid/invalid persistence, missing context,
immutable state, superseded selections, header override prevention, request
cancellation, distinct 400/401/403/404/409 handling, next-request membership
revocation, refreshed role/permission hints, guards, directory/role display,
disabled invitation/creation UI, registration and scoped notification reset.

Real shell/routed-component tests verify **Systems, Endpoints, Saved Tests and
Governance** have no A_PRIVATE_DATA after switching to B, then show B_PRIVATE_DATA.
The test intentionally resolves B before a change-detection tick to verify the
epoch boundary, not merely an intermediate spinner. A separate singleton-service
test proves A notifications clear before B loads.

No frontend test runner was configured originally despite the ng test script and
Vitest-type reference. Standard Angular 16 CLI Karma/Jasmine tooling was added,
with declared dependencies and lockfile updated.

Commands:

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:ci
node .\node_modules\@angular\cli\bin\ng.js build --configuration=development
```

Backend:

```powershell
dotnet build src\Api\Api.csproj --no-restore --verbosity minimal
dotnet test tests\TenantAuthorization.Tests\TenantAuthorization.Tests.csproj --no-build --no-restore --verbosity minimal
```

Development-build warnings remain for unchanged oversized feature SCSS and
pre-existing unused compilation entries. An initial clean backend compilation
also surfaced an existing unused-variable warning; the final API build passed
with zero warnings. No unrelated warning cleanup was performed.

## 8. Files created

Frontend:

- [Organization models](../src/app/core/models/organization.ts)
- [Organization context](../src/app/core/services/organization-context.service.ts)
- [Organization guard](../src/app/core/guards/organization.guard.ts)
- [Permission directive](../src/app/core/directives/permission.directive.ts)
- [Switcher](../src/app/shared/components/organization-switcher/organization-switcher.component.ts)
- [Settings/directory](../src/app/features/organizations/organizations.component.ts)
- [Invitation acceptance placeholder](../src/app/features/organizations/invitation-accept.component.ts)
- [Access-denied page](../src/app/features/organizations/access-denied.component.ts)
- [State/interceptor/guard tests](../src/app/core/services/organization-context.service.spec.ts)
- [Test fixtures](../src/app/core/services/organization.fixtures.spec.ts)
- [Organization UI tests](../src/app/features/organizations/organizations.component.spec.ts)
- [Actual shell switching tests](../src/app/layout/shell/organization-switch.spec.ts)
- [Registration test](../src/app/features/auth/login/login.component.spec.ts)
- This requested report.

Backend:

- [Readonly organization reader/DTOs](../../endpoint_hub_api/src/Application/Features/Organizations/OrganizationReadService.cs)
- [Discovery metadata](../../endpoint_hub_api/src/Api/Authorization/OrganizationDiscoveryAttribute.cs)
- [Organization controller](../../endpoint_hub_api/src/Api/Controllers/OrganizationsController.cs)
- [Organization reader tests](../../endpoint_hub_api/tests/TenantAuthorization.Tests/OrganizationReadTests.cs)

## 9. Files modified

Frontend core/routing:

- [API interceptor](../src/app/core/interceptors/auth.interceptor.ts)
- [Authentication service](../src/app/core/services/auth.service.ts)
- [Notification service](../src/app/core/services/notification.service.ts)
- [Routes](../src/app/app.routes.ts)

Layout:

- [Header TypeScript](../src/app/layout/header/header.component.ts), [template](../src/app/layout/header/header.component.html), [styles](../src/app/layout/header/header.component.scss)
- [Shell TypeScript](../src/app/layout/shell/shell.component.ts), [template](../src/app/layout/shell/shell.component.html), [styles](../src/app/layout/shell/shell.component.scss)
- [Sidebar TypeScript](../src/app/layout/sidebar/sidebar.component.ts), [template](../src/app/layout/sidebar/sidebar.component.html)

Related feature UX:

- [Login TypeScript](../src/app/features/auth/login/login.component.ts), [template](../src/app/features/auth/login/login.component.html)
- [Users TypeScript](../src/app/features/users/users.component.ts), [template](../src/app/features/users/users.component.html)
- [Endpoint-list TypeScript](../src/app/features/endpoints/endpoint-list/endpoint-list.component.ts), [template](../src/app/features/endpoints/endpoint-list/endpoint-list.component.html)
- [Swagger TypeScript](../src/app/features/swagger-sync/swagger-sync.component.ts), [template](../src/app/features/swagger-sync/swagger-sync.component.html)
- [Saved-test TypeScript](../src/app/features/embedded-test/embedded-test.component.ts), [template](../src/app/features/embedded-test/embedded-test.component.html)
- [Governance standards TypeScript](../src/app/features/governance/governance-standards/governance-standards.component.ts), [template](../src/app/features/governance/governance-standards/governance-standards.component.html)
- [Governance detail TypeScript](../src/app/features/governance/governance-detail/governance-detail.component.ts), [template](../src/app/features/governance/governance-detail/governance-detail.component.html)

Tooling/localization/docs:

- [Package manifest](../package.json), [lockfile](../package-lock.json)
- [Angular CLI configuration](../angular.json), [test TypeScript configuration](../tsconfig.spec.json)
- [English](../src/assets/i18n/en.json), [Arabic](../src/assets/i18n/ar.json)
- [README](../README.md)

Backend:

- [Application DI](../../endpoint_hub_api/src/Application/DependencyInjection.cs)
- [Organization middleware](../../endpoint_hub_api/src/Api/Middlewares/ActiveOrganizationMiddleware.cs)

ApiService itself is stateless and unchanged: its existing calls inherit context
through the interceptor. No feature-by-feature organization header additions
were made. No environment/deployment/database configuration was retargeted.

## 10. Backend gaps and remaining risks

Unimplemented backend lifecycles, explicitly not certified:

- Organization creation/editing.
- Member invitations, acceptance/status verification, pending listing and delivery.
- Member revocation/change and assignable-role catalog/role management.
- Revoked-member history: the read directory returns active members only.

Validation limitations:

- Browser tests use mocked HTTP, not a live backend/SQL Server.
- New readonly endpoints have isolated backend tests; their live SQL Server/HTTP
  behavior has not been exercised in this checkpoint. Checkpoint 6's live
  evidence is not reused as validation of these new endpoints.
- The backend must be run only in the approved MigrationTest
  RelationalValidation configuration for any subsequent live validation. Normal
  startup seeds/workers have not been approved by this checkpoint.
- Remote revocation is detected on a denied request/context revalidation, not by
  realtime push. No immediate cross-tab or server-push revocation claim.
- Canceling browser subscriptions prevents stale UI responses; it does not prove
  rollback of a server write already dispatched.
- The previously documented tracked authorization/write race remains unresolved.
- Outbound endpoint execution and background/realtime tenancy remain separate
  checkpoints.

**STOP:** no HangFire, SignalR tenant isolation, concurrency mitigation, database
changes or additional Owner grants were implemented.
