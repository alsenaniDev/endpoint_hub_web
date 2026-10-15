# Phase 11.1 — Angular role usability without permission expansion

Completed 2026-10-03. Source implementation and verification only. No database writes, schema changes, migrations, role changes or permission provisioning.

## Result

| Role | Implemented journey | Authority deliberately withheld |
|---|---|---|
| Admin | Live organization bootstrap → management workspace → team/system/environment/Swagger-source commands or endpoint notes, using known organization-owned IDs and explicit input | Raw catalogue reads, AuthProfiles, endpoint execution, Swagger execution/scheduling, export, governance execution/destruction, platform and lifecycle administration |
| Developer | Live organization bootstrap → endpoint-notes-only management workspace → known endpoint ID → explicit notes/page-usage replacement | Catalogue browsing, request execution, saved-test credentials, AuthProfiles, Swagger execution and other management modules |
| Viewer | Structurally valid bootstrap → dashboard or another permitted read route → six read modules, with structural IDs/counts/statuses and read-only controls | Arbitrary sensitive text, credentials, history/code access, sharing/favorites/seen state, notification mutation and all organization write/execution effects |

This makes the approved **known-ID management** and **structural oversight** journeys reachable. It does not make named catalogue browse-and-edit or unrestricted developer documentation an approved product capability.

## Membership and DTO contract

- [Membership state](../endpoint_hub_api/src/Application/Features/Organizations/MembershipState.cs) is typed and strictly validated. The JSON contract retains `"state": "Active"` for valid memberships, including protected Viewer responses. Arbitrary enum/string values are not accepted.
- [OrganizationReadService](../endpoint_hub_api/src/Application/Features/Organizations/OrganizationReadService.cs) returns required boolean `membership.isReadOnly`, derived from persisted membership using the existing backend Viewer semantics.
- Organization member state is also typed. Arbitrary organization/role/member descriptions and names remain subject to Viewer redaction; no generic string whitelist was introduced.
- Dashboard environment rows now include a tenant-scoped GUID `systemId`, populated from the existing relationship. No EF entity or schema change was needed.
- Angular validates Active state, boolean read-only metadata and the capability-list shape before accepting context. Missing or invalid metadata fails closed with an explicit context error.
- Metadata validation now occurs before replacing a refreshed context, so a malformed capability list cannot silently clear context without reporting failure.
- `isReadOnly` is a UI effect restriction, **not a grant**. Each action/route still checks its live permission; backend controller/MediatR/persistence/effect authorization remains authoritative.
- No tenant authority is obtained from legacy JWT role or permission hints.

Deploy the backend contract with/before the matching frontend. An older backend that omits `isReadOnly` is intentionally rejected rather than interpreted as write-capable.

## Navigation and bootstrap

- Login/registration, root and unknown-route fallback now use an authorized landing route rather than assuming dashboard access.
- Landing selection uses the live organization context:
  1. Dashboard only when all five backend dependencies are present.
  2. Management workspace when a permitted management capability and mutation effect are available.
  3. An available structural read route.
  4. Organization settings, or the existing independently verified platform-users capability when appropriate.
- Dashboard authorization now requires `teams.view`, `systems.view`, `environments.view`, `endpoints.view` and `swaggersync.view`, matching the backend.
- Organization switching first discards old resource navigation, cancels old-scope requests and clears old capability/form state. The destination is selected from the successfully loaded new membership, not the old role.
- Sidebar management access is separate from catalogue access. Sparse Admin/Developer bundles no longer enter an unauthorized read screen merely to find a write form.
- History/generated-code routes and links additionally enforce the existing CredentialAccess effect boundary. Viewer cannot reach them using `endpoints.view`.
- Directory and switcher labels use approved opaque IDs for restricted Viewer metadata, rather than recovering arbitrary text from another DTO.

## Management-only workspace

The new [management workspace](src/app/features/management/management.component.ts) sends only existing approved write commands. It performs **no catalogue GET, parent-discovery read, AuthProfile lookup or post-save catalogue refresh**.

| Capability | Available commands | Structural input |
|---|---|---|
| `teams.manage` | Create, explicitly replace editable fields, delete | Known team ID for update/delete |
| `systems.manage` | Create, explicitly replace editable fields, delete | Known system ID and required parent team ID |
| `environments.manage` | Environment create/update/delete; Swagger-source create/update/delete | Known resource IDs; system ID on environment creation; environment ID for nested source commands |
| `endpoints.manage` | Replace endpoint notes and used-in-pages values | Known endpoint ID |

Safety behavior:

- Resource/parent inputs must be nonzero GUIDs. Resource and operation choices come only from the current granted bundle.
- Full replacement/clear and deletion require explicit acknowledgement. The page states that existing values are not loaded or implicitly preserved.
- No `[restricted]` placeholder is used as a prefilled update value.
- Environment parent reassignment is not offered: `systemId` is create-only in its update contract.
- The active flag is an explicit validated selection; an unset value cannot silently activate/deactivate a resource.
- Optional environment base URL remains optional, matching the existing backend; source-required URL/base URL validation is retained.
- Command response content is not displayed. Only a validated affected/created resource GUID is shown, allowing approved creation chains without a read grant.
- A success response with an invalid created ID produces an explicit outcome-warning, not an invented ID or a success-shaped fallback. The user is told to verify before repeating the command.
- 403 and other backend statuses are mapped to explicit messages. A denied command is not automatically retried.
- Organization switching cancels pending commands and clears entered content, acknowledgement and result IDs.
- Existing backend ancestry, creator-private, deletion, AuthProfile dependency and persistence guards remain unchanged.

There is deliberately no default AuthProfile binding control, credential retrieval, request runner, Swagger sync execution, schedule control, export or lifecycle mutation in this workspace.

## Viewer controls and presentation

- Favorite/share/remove-shared controls and callbacks are blocked. No seen-state mutation was added.
- Notification clicks do not mark read for Viewer; mark-read/mark-all actions are withheld and guarded in the service as well as the component.
- Governance run deletion requires its actual management capability and mutation eligibility.
- Endpoint notes become read-only without authorized management. History and generated-code links are withheld for structural access.
- Free-text/tag search and copy features that depend on restricted arbitrary content are withheld; compliance-report path search is likewise unavailable to Viewer.
- Teams, systems, environments, organization/member/role directories and Swagger status use stable structural labels and existing typed counts/statuses.
- Dashboard grouping/expansion uses system IDs, never redacted display names. Missing Viewer `systemId` is an explicit contract error, not a fabricated aggregate.
- Viewer endpoint counts are labelled **visible endpoint records**, with pagination indicated, rather than incorrectly claiming canonical path-based uniqueness.
- Read failures, including 403, are explicit in affected features and the centralized shell message. No denied operation is converted to an empty successful outcome.
- The broad Viewer arbitrary-text/opaque-content redaction policy remains in place. No strings, secrets, headers, history, snapshots, schemas or URLs were restored through another DTO.

## Verification

### Test counts before/after

The before counts are the previously executed audit/certification baselines, not a rollback/re-execution of old source during this checkpoint.

| Suite | Before | Newly executed final result | Change |
|---|---:|---:|---:|
| Full Angular suite | 49 passed | **122 passed, 0 failed** | 73 additional cases; existing tests preserved |
| Full backend authorization suite | 239 passed | **263 passed, 0 failed, 0 skipped** | 24 additional cases; existing tests preserved |

New Angular coverage:

| Area | Cases |
|---|---:|
| Role bootstrap/landing/route guards, typed metadata, switching/revocation | 16 |
| Management-only commands, no read dependencies, explicit replacement, IDs, errors and scope cleanup | 22 |
| Structural read surfaces/directories and explicit 403 handling | 9 |
| Viewer controls, callbacks, sensitive links, redacted grouping/counts, notifications and compliance behavior | 26 |
| Total new Angular cases | **73** |

The Viewer-focused run also preserved 11 existing realtime cases: **37/37**. Backend focused contract/content/dashboard runs passed **46/46** before the full 263-case regression.

Commands executed:

```powershell
node .\node_modules\@angular\cli\bin\ng.js test --watch=false --browsers=ChromeHeadless
node .\node_modules\@angular\cli\bin\ng.js build --configuration=production
dotnet test ..\endpoint_hub_api\tests\TenantAuthorization.Tests\TenantAuthorization.Tests.csproj --no-restore --verbosity minimal
dotnet build ..\endpoint_hub_api\src\Api\Api.csproj --no-restore --verbosity minimal
```

Angular tests ran in actual ChromeHeadless 154 with mocked application HTTP. Backend DTO/controller tests use isolated in-memory/test-host evidence. These are **not newly executed live SQL-backed role login sessions**.

The editor test adapter did not discover the Angular specs; the existing Angular CLI/Karma runner was used successfully. Initial focused validation exposed test typing/expectation mistakes and an in-progress helper placement error; these were corrected before the final passing suites. An intermediate production compile during concurrent dashboard editing also failed; the final production build succeeded.

### Builds

- **Angular production build succeeded**, including the lazy management route.
- Initial bundle: 734.51 kB raw / 159.46 kB estimated transfer.
- Existing warnings remain: five component-style budget warnings (AuthProfiles, embedded test, endpoint list, environments, Swagger sync) and four unused-source warnings (permissions and three environment variants). No CSS-budget relaxation or unrelated warning remediation was performed.
- **API build succeeded: 0 warnings, 0 errors.**
- Both English/Arabic JSON files and the required new keys were parsed/validated.
- An isolated frontend development server compiled and responded HTTP 200, then was stopped. No application API server was launched for this checkpoint.

## Database preservation

The approved guarded `verify-role-validation` mode was run before final validation and again after tests/builds. It performs SELECT-only verification, not fixture creation, cleanup, provisioning or migration application.

Final certificate captured **2026-10-03T18:56:15.2633767Z**:

| Measure | Before | After |
|---|---:|---:|
| Roles | 6 | **6** |
| Permissions | 19 | **19** |
| RolePermissions | 48 | **48** |
| Owner grants | 8 | **8** |
| Admin grants | 4 | **4** |
| Developer grants | 1 | **1** |
| Viewer grants | 6 | **6** |
| Lifecycle definitions / grants | 0 / 0 | **0 / 0** |
| Captured tables / application rows | 41 / 231 | **41 / 231** |
| Persistent application/catalog delta | 0 | **0** |

Target: `DESKTOP-NT1M6V7 / TWKEndpointsHub_MigrationTest`.

All 48 composite mapping identities and captured catalog/application fingerprints match certification. This preserves all original 37 mappings plus the approved 11, Owner grants, the absence of all 15 conditional mappings and the existing excluded organization-role capabilities.

Migration history remains:

- `20261002014612_AdoptExistingSchema`
- `20261002030613_ExpandTenantSchema`

Pending migrations/model changes: none reported. No migrations, indexes or schema changes were executed. Persistent delta is scoped to captured application rows/catalog; no bit-for-bit internal engine-state claim is made.

**The original database was never connected to.** No SQL-backed identities, memberships or business fixtures were created. No permission/RolePermission row was added, changed or removed.

## Remaining UX gaps and policy boundaries

1. **No current real-role actors:** the audit found zero active Admin/Developer/Viewer memberships. Actual native login/UI acceptance remains pending supplied accounts or explicitly approved cleanup-safe fixtures/separate disposable environment. This checkpoint did not create them.
2. **Existing-resource discovery:** Admin/Developer must obtain existing IDs through an already approved workflow. No safe existing management-reference API supplies named catalogue selectors. Manual validated IDs are supported; expanding a raw GET to `manage OR view` is not.
3. **No read/prefill of existing values:** updates are explicitly supplied replacements. Normal named browse-and-edit and conventional developer documentation require a separate permission/content-policy decision.
4. **Structural-only Viewer limitations:** arbitrary names, descriptions, paths, documentation and messages remain restricted. Typed statuses/counts and IDs support oversight; they cannot substitute for unrestricted documentation.
5. **Notification navigation/content:** read-only structural notifications do not restore arbitrary event text or infer navigation from restricted string types. Rich classified event navigation would need a separately reviewed narrow typed contract.
6. **Protected deletion/binding:** global user associations and AuthProfile dependencies can still block otherwise permitted deletes. AuthProfile binding/destruction is not enabled by this workspace.
7. **Network authority:** saving Swagger/environment configuration does not approve a destination or execute a request. Network execution/destination safety remains separately default-deny.
8. **Sensitive/conditional/lifecycle capabilities remain unapproved:** no Admin/Developer catalogue grants, `governance.run`, `governance.manage`, AuthProfiles, execution, schedule, export, platform users or lifecycle grants were provisioned.
9. **Deployment compatibility:** rollout must include the typed membership/read-only metadata; do not fix an older server mismatch with permissive frontend defaults.

## Exact changed files

Paths below are relative to this frontend workspace, except explicitly linked backend files. No dependency manifest, migration, EF mapping, seeder or permission definition was changed.

### Contracts, navigation and shell

- [app.routes.ts](src/app/app.routes.ts)
- [organization-navigation.ts](src/app/core/authorization/organization-navigation.ts)
- [organization.guard.ts](src/app/core/guards/organization.guard.ts)
- [organization-landing.guard.ts](src/app/core/guards/organization-landing.guard.ts)
- [organization.ts](src/app/core/models/organization.ts)
- [models.ts](src/app/core/models/models.ts)
- [organization-context.service.ts](src/app/core/services/organization-context.service.ts)
- [api.service.ts](src/app/core/services/api.service.ts)
- [login.component.ts](src/app/features/auth/login/login.component.ts)
- [organization-switcher.component.ts](src/app/shared/components/organization-switcher/organization-switcher.component.ts)
- [sidebar.component.ts](src/app/layout/sidebar/sidebar.component.ts)
- [sidebar.component.html](src/app/layout/sidebar/sidebar.component.html)
- [organizations.component.ts](src/app/features/organizations/organizations.component.ts)

### Management and structural read surfaces

- [management.component.ts](src/app/features/management/management.component.ts)
- [management.component.html](src/app/features/management/management.component.html)
- [teams.component.ts](src/app/features/teams/teams.component.ts)
- [teams.component.html](src/app/features/teams/teams.component.html)
- [systems.component.ts](src/app/features/systems/systems.component.ts)
- [systems.component.html](src/app/features/systems/systems.component.html)
- [environments.component.ts](src/app/features/environments/environments.component.ts)
- [environments.component.html](src/app/features/environments/environments.component.html)
- [swagger-sync.component.ts](src/app/features/swagger-sync/swagger-sync.component.ts)
- [swagger-sync.component.html](src/app/features/swagger-sync/swagger-sync.component.html)
- [endpoint-list.component.ts](src/app/features/endpoints/endpoint-list/endpoint-list.component.ts)
- [endpoint-list.component.html](src/app/features/endpoints/endpoint-list/endpoint-list.component.html)
- [endpoint-detail.component.ts](src/app/features/endpoints/endpoint-detail/endpoint-detail.component.ts)
- [endpoint-detail.component.html](src/app/features/endpoints/endpoint-detail/endpoint-detail.component.html)
- [change-history.component.ts](src/app/features/endpoints/change-history/change-history.component.ts)
- [change-history.component.html](src/app/features/endpoints/change-history/change-history.component.html)
- [code-generator.component.ts](src/app/features/endpoints/code-generator/code-generator.component.ts)
- [code-generator.component.html](src/app/features/endpoints/code-generator/code-generator.component.html)
- [governance-detail.component.ts](src/app/features/governance/governance-detail/governance-detail.component.ts)
- [governance-detail.component.html](src/app/features/governance/governance-detail/governance-detail.component.html)
- [compliance-report.component.ts](src/app/features/governance/compliance-report/compliance-report.component.ts)
- [compliance-report.component.html](src/app/features/governance/compliance-report/compliance-report.component.html)
- [dashboard.component.ts](src/app/features/dashboard/dashboard.component.ts)
- [dashboard.component.html](src/app/features/dashboard/dashboard.component.html)
- [notification-bell.component.ts](src/app/shared/components/notification-bell/notification-bell.component.ts)
- [notification-bell.component.html](src/app/shared/components/notification-bell/notification-bell.component.html)
- [notification.service.ts](src/app/core/services/notification.service.ts)

### Frontend tests, localization and documentation

- [role-navigation.spec.ts](src/app/core/guards/role-navigation.spec.ts)
- [organization.fixtures.spec.ts](src/app/core/services/organization.fixtures.spec.ts)
- [management.component.spec.ts](src/app/features/management/management.component.spec.ts)
- [structural-read-surfaces.spec.ts](src/app/features/organizations/structural-read-surfaces.spec.ts)
- [viewer-usability.spec.ts](src/app/features/endpoints/viewer-usability.spec.ts)
- [en.json](src/assets/i18n/en.json)
- [ar.json](src/assets/i18n/ar.json)
- [Earlier audit, historical findings retained](ROLE-USABILITY-AUDIT.md)
- [This implementation report](PHASE-11-1-ROLE-USABILITY-IMPLEMENTATION.md)

### Backend source and tests

- [OrganizationReadService.cs](../endpoint_hub_api/src/Application/Features/Organizations/OrganizationReadService.cs)
- [MembershipState.cs](../endpoint_hub_api/src/Application/Features/Organizations/MembershipState.cs)
- [DashboardStatsDto.cs](../endpoint_hub_api/src/Application/Features/Auth/DTOs/DashboardStatsDto.cs)
- [GetDashboardStatsQueryHandler.cs](../endpoint_hub_api/src/Application/Features/Auth/Queries/GetDashboardStatsQueryHandler.cs)
- [OrganizationReadTests.cs](../endpoint_hub_api/tests/TenantAuthorization.Tests/OrganizationReadTests.cs)
- [ViewerHttpTests.cs](../endpoint_hub_api/tests/TenantAuthorization.Tests/ViewerHttpTests.cs)
- [DashboardReadTests.cs](../endpoint_hub_api/tests/TenantAuthorization.Tests/DashboardReadTests.cs)

Phase 11.1 stops here. No conditional grant, lifecycle implementation or additional authority was approved or provisioned.
