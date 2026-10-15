# Angular organization-role usability audit

Implementation follow-up: [Phase 11.1](PHASE-11-1-ROLE-USABILITY-IMPLEMENTATION.md) addresses the source/UX blockers without changing grants. The findings below remain the historical pre-implementation audit.

Audit completed: 2026-10-03. Review only; no production application changes or database writes.

## Executive result

The certified authorization pipeline and the current Angular user journeys do not agree:

- **Admin:** four legitimate management capabilities, but no normal tenant management screen is reachable.
- **Developer:** legitimate endpoint-management capability, but neither the endpoint catalogue nor its notes editor is reachable.
- **Viewer:** discovery redacts the membership-state string that Angular requires for bootstrap. Consequently, the current Viewer cannot establish a usable organization context. After correcting only that contract, additional broken and unauthorized controls remain.

Do not fix these problems by adding read grants, weakening the backend, allowing `manage` to bypass raw catalogue reads, or restoring unclassified Viewer strings.

## Evidence boundary: not a completed real-user acceptance test

A guarded SELECT-only MigrationTest query found **zero active Organization Admin, Developer and Viewer memberships** and one active Owner membership. The approved role definitions and grants exist, but no currently available live actor carries these three roles.

Creating actors/memberships would change the database; login also updates login state. Neither was performed. Thus an end-to-end audit **as actual signed-in users of these roles remains unexecuted** under the no-database-change instruction.

Evidence used:

| Evidence | Result | What it does and does not establish |
|---|---|---|
| Current Angular routes, guards, services, templates and component code | Traced against exact provisioned bundles | Establishes UI reachability, requested APIs and visible action dependencies |
| Post-remediation backend controllers, organization projection and content/effect policy | Inspected | Establishes why withholding reads and denying Viewer effects are intentional |
| Existing Checkpoint 10.10 certification | 259/259 live SQL-backed assertions passed previously | Establishes backend authority; not new Angular or real-user evidence |
| Existing Angular regression suite, newly executed | 49/49 passed in ChromeHeadless | Existing tests primarily exercise broader Owner-style fixtures; they do not establish these sparse role journeys |
| Temporary current-role Angular component/guard probes, newly executed | 8/8 passed in ChromeHeadless | Mock HTTP, real Angular components/services/guards, certified permission bundles; assertions reproduce defects, not successful journeys |
| Angular isolated development compilation | Succeeded; HTTP 200 | Existing unused-source/outputHashing warnings remained; no claim of zero warnings or a newly executed production build |
| Integrated-browser intercepted-session attempt | Did not produce a usable rendered role journey | Not counted as successful UI or live-role evidence |
| Final guarded read-only certification verification | Exit 0, complete catalog/data equality | Confirms preserved application/database state and all 48 mappings |

The temporary spec was removed from application source after execution. A copy of the probe source is retained in session evidence as `angular-role-usability-audit.spec.ts`. No test touched SQL or an actual application API.

## Current authority

| Role | Granted permissions |
|---|---|
| Admin | `teams.manage`, `systems.manage`, `environments.manage`, `endpoints.manage` |
| Developer | `endpoints.manage` |
| Viewer | `teams.view`, `systems.view`, `environments.view`, `endpoints.view`, `swaggersync.view`, `governance.view` |

Management does **not** imply catalogue read. Viewer additionally has a server-enforced Read-only effect boundary and structural content projection. Frontend permission-key checks alone do not encode this boundary.

## Screen/navigation matrix

Viewer entries below distinguish **current bootstrap failure** from behavior **after a hypothetical membership-metadata fix only**. The latter is not implemented.

| Screen/route | Admin now | Developer now | Viewer now / after metadata-only fix |
|---|---|---|---|
| Login destination, root and unknown-route fallback | Hardcoded dashboard leads to access-denied | Same | Tenant bootstrap fails / dashboard becomes reachable |
| Organization switch destination | Hardcoded dashboard leads to access-denied | Same | Selection/context fails / dashboard becomes reachable |
| `/dashboard` | Denied: requires `endpoints.view`; backend also checks five read capabilities | Denied | Blocked by bootstrap / permitted by the six-key bundle, but redacted grouping is incorrect |
| `/teams` | Hidden and denied despite `teams.manage` | Hidden and denied, intentionally no team capability | Blocked / structural read permitted; no CRUD authority |
| `/systems` | Hidden and denied despite `systems.manage` | Hidden and denied | Blocked / structural read permitted; no CRUD authority |
| `/environments` | Hidden and denied despite `environments.manage` | Hidden and denied | Blocked / structural read permitted; no environment/source mutation authority |
| `/endpoints`, `/endpoints/:id` | Hidden and denied despite `endpoints.manage` | Same | Blocked / structural catalogue/detail permitted; misleading actions remain |
| Endpoint history and generated-code routes | Denied at Angular view guard | Denied at Angular view guard | Blocked / Angular permits by `endpoints.view`, backend denies CredentialAccess effect |
| `/swagger-sync` | Hidden and denied: no `swaggersync.view` | Same | Blocked / structural status read permitted; execution and schedule controls appropriately withheld |
| Governance catalogue, standard detail, existing report | Hidden and denied | Hidden and denied | Blocked / structural reads permitted; run Delete remains wrongly visible |
| Governance validation runner | Hidden and denied | Hidden and denied | Denied: no `governance.run` |
| Endpoint runner and embedded saved-test screen | Hidden and denied | Hidden and denied | Denied: no `endpoints.run` |
| AuthProfiles | Hidden and denied | Hidden and denied | Denied: no `authprofiles.view` |
| Users/platform administration | Hidden and denied | Hidden and denied | Denied: organization roles do not confer `users.manage` |
| Organizations, profile, access-denied, invitation placeholder | Identity/utility routes reachable; no lifecycle writes | Same | Identity routes remain reachable; Viewer directory/member/role text is restricted |
| User Guide, language/theme and logout | Reachable | Reachable | Reachable |
| Notification bell | Organization read/write behavior is separate from catalogue grants | Same | Read data is structural; mutation buttons still presented despite write-effect denial |

The sidebar for a ready Admin or Developer exposes no tenant product module: only its non-permission User Guide entry remains visible. Identity routes elsewhere in the shell do not remedy this.

## Admin: exact broken management journeys

1. **Team CRUD:** create/edit/delete controls exist only inside the `teams.view`-guarded Teams component. That component also immediately loads the read catalogue and reloads it after writes. Admin cannot reach the form or obtain that catalogue.
2. **System CRUD:** the `systems.view`-guarded screen eagerly requests systems plus `teams.view` for its required parent selector. Admin lacks both reads. Relaxing just the route guard would still leave unauthorized requests and unusable selection/reload.
3. **Environment and Swagger-source management:** the `environments.view`-guarded screen requests systems for its parent picker and environments for its list. Editing loads Swagger sources through a view-protected read, then successful writes reload environments. All those read dependencies are absent. Environment management does not authorize sync execution or schedule management.
4. **Endpoint notes/used-in-pages editing:** the endpoint-detail route requires `endpoints.view`, and its editor depends on a raw GET detail before rendering the `endpoints.manage` save control. Admin cannot use the approved PATCH workflow through the UI.
5. **Dashboard/default landing:** every normal landing assumes a read capability Admin does not have. Access-denied here is accurate enforcement, not backend failure.

Protected team/system deletion and AuthProfile dependencies must remain intact. A team with global user references cannot be deleted; deleting a system with protected AuthProfile effects requires the separately withheld capability. Default endpoint AuthProfile binding also requires `authprofiles.manage`. The four manage keys do not mean every destructive/binding operation must succeed.

## Developer: exact broken journey

The approved endpoint PATCH capability is behind the same read-gated detail page and raw-detail dependency. There is no management-only route, navigation entry or editor. The Developer therefore has no usable normal development module despite an approved write capability.

This bundle does not authorize browsing named API documentation, inspecting bodies/headers/examples/history, running requests, retrieving saved-test tokens, managing AuthProfiles, creating teams/systems/environments, importing Swagger, or running governance. A complete conventional development workflow cannot be obtained by frontend work alone while those boundaries remain unchanged.

`endpoints.manage` currently supports notes/used-in-pages updates and the separately protected AuthProfile-binding operation; it is not an endpoint-creation or execution grant.

## Viewer: bootstrap blocker

Backend [OrganizationReadService](../endpoint_hub_api/src/Application/Features/Organizations/OrganizationReadService.cs) declares membership `State` as a string and projects `"Active"`. Viewer discovery explicitly applies [ViewerContentPolicy](../endpoint_hub_api/src/Application/Common/Authorization/ViewerContentPolicy.cs), which replaces arbitrary strings with `[restricted]`. Permission metadata has a dedicated safe exception; membership state does not.

Angular [OrganizationContextService](src/app/core/services/organization-context.service.ts) rejects discovery/current/refresh memberships unless `state === 'Active'`. It consequently reports `org.loadFailed`, never becomes ready, and cannot establish the organization required by tenant routes.

Role names, organization names/slugs/types and member display names are also strings; their redaction affects labels but must not be bypassed indiscriminately.

**Required minimum backend correction:** represent authority metadata as typed, validated structural values, for example a membership-state enum or an explicit active-membership boolean. Expose only fixed canonical role/effect metadata where needed, derived from live scoped identity. Keep arbitrary descriptive text restricted. Update the matching Angular contract and bootstrap tests.

Do not accept `[restricted]` as an active-state value, infer Viewer authority from JWT role text, or disable membership validation.

## Viewer: latent problems after a metadata-only correction

| Surface/action | Current implementation | Consequence | Minimum correction |
|---|---|---|---|
| Endpoint history / generated code | Links and routes check only `endpoints.view` | Backend rejects Viewer CredentialAccess; history becomes empty-state, generated code becomes blank after error handling | Gate route and link by capability **and effect**; render explicit denied/error state |
| Endpoint favorites, individual/bulk sharing, remove-shared | Mutation controls lack Viewer/effect checks | Visible actions issue requests the backend denies | Hide/disable mutation affordances and guard callbacks; retain server denial |
| Shared seen-state | API method exists; no current component caller found | No evidence of an automatic seen-state write in this UI | Preserve denial; do not add a read-triggered mutation |
| Endpoint notes | Inputs remain editable, Save hidden by manage check | User can type changes that cannot be saved | Read-only presentation, not an editable-looking form |
| Governance validation-run Delete | Unconditional button/callback | Viewer gets backend denial | Require `governance.manage` and permitted effect for button and callback |
| Notifications | Mark-all appears when unread; notification click calls markRead | Viewer gets denied mutation; count does not clear | Separate navigation/read action from mutation, hide mark-read actions, preserve server-owned unread state |
| Notification navigation | Requires arbitrary string type equal to `share` | Redacted type prevents expected navigation | Use fixed typed event classification or validated structural link metadata; do not restore arbitrary messages |
| Dashboard system grouping | Group key is `systemName` | Distinct systems collapse into one `[restricted]` group | Add safe `SystemId` to the dashboard contract and group by identity |
| Endpoint unique count | Uses `systemId + method + path` | Distinct redacted paths collapse; a two-item probe reports unique count 1 | Do not deduplicate using projected text; use a correctly specified typed/backend count or safe canonical identity |
| Environment selector grouping | Uses system display name | Restricted names collapse display groups | Group by system ID with stable opaque labels |
| Tags / free-text search / URL and documentation copy | Operate on projected arbitrary text | Indistinguishable tags, `[restricted]` sent as tag filter, meaningless search/copy output | Disable unavailable content-based controls, provide structural filters, explain restrictions |
| Teams/systems/environments/governance/read reports | Many names, descriptions, paths, rule explanations and messages are intentionally restricted | Structurally allowed data is not conventional readable documentation | Render explicit restricted placeholders and opaque identifiers; retain typed statuses/counts |

The Viewer read permissions authorize **structural oversight**, not unrestricted readable API documentation. Restoring names, paths, URLs, arbitrary rules/messages or schemas is a separate content-policy decision, even if current sample data seems harmless.

## Minimum changes, in implementation order

### 1. Repair safe organization metadata (backend + frontend)

- Change membership-state representation to validated structural metadata consistently across discovery/current/member DTOs and projection.
- Return fixed scoped role/effect/capability metadata suitable for UI gating; never arbitrary authority strings or token-derived tenant authority.
- Update Angular models, initialization/refresh checks and contract tests.
- Preserve live membership checks, header enforcement, Viewer projection and revoked-context handling.

### 2. Make landing and navigation capability-aware (frontend)

- Replace hardcoded dashboard destinations in login, organization switch, root and fallback behavior with an authorized landing resolver.
- Prefer a neutral organization/workspace page when no authorized product route exists.
- Dashboard UI authorization should mirror its full backend read dependency rather than only `endpoints.view`.
- Add management destinations separately from read destinations; do not redirect manage-only actors into the existing raw catalogue.

### 3. Make read-only UI truthful (frontend, narrowly typed DTO changes)

- Gate sensitive routes/actions by effects as well as permission keys.
- Remove Viewer sharing/favorites/governance-delete/notification-write affordances and make unsaveable inputs read-only.
- Do not make GET/read navigation mutate seen or notification state.
- Show explicit forbidden/error feedback instead of empty success-shaped screens.
- Group by stable IDs, correct unique-count semantics, disable content-based features that cannot operate on structural responses, and explain restricted content.
- Add safe dashboard system identity and typed notification classification if those journeys require them.

These changes make the current Viewer structural journey usable without adding grants or exposing arbitrary content.

### 4. Expose approved management workflows without smuggling in reads (frontend + reviewed backend contract)

For Admin, add dedicated team/system/environment/source-management flows and an endpoint-notes editor. For Developer, add only the endpoint-notes management flow.

The strictest unchanged-authority option is explicit known-resource/parent ID input and user-supplied write values, with command-specific responses and no raw GET prefill. That supports limited create/update workflows, but is not a satisfactory named browse-and-edit experience.

For practical resource selection, a separate **reviewed, narrowly structural management-reference/context API** may return organization-owned opaque IDs, relationships, typed status and permitted operation metadata to the exact manage capability. It must not return names, URLs, existing notes, schemas, credentials or arbitrary catalogue content merely because the caller has manage.

Such an API is a deliberate source-level authorization/response change and needs design/security approval; it is not already authorized by this audit. Changing `.view` checks to `.view OR .manage` on existing catalogue APIs is not the minimum safe fix.

Editing must not prefill restricted placeholders as actual values or overwrite unknown fields. Send only explicit user changes, use the existing concurrency/scope protections, and avoid unauthorized post-save catalogue reloads.

### 5. Separate policy decisions from usability fixes

Normal named catalogue administration/development requires explicit acceptance of the withheld trusted-content reads. The fourteen conditional Admin/Developer mappings and Admin destructive-governance mapping remain ungranted. This audit does not approve them.

Keep execution, saved-test credentials, AuthProfiles, Swagger execution/destinations, schedule management, export, global user administration and lifecycle operations excluded. No network destination becomes trusted because a UI route is reachable or organization authorization succeeds.

## Newly executed synthetic probes: 8/8

These tests assert the current failures. Viewer tests 4-8 intentionally model only a hypothetical safe-state metadata repair, with other strings still restricted.

1. Admin four-key context: granted management present, no tenant sidebar destination, all representative read/execution/platform route checks denied.
2. Developer one-key context: same management/read navigation mismatch.
3. Viewer actual projected discovery: bootstrap false, not ready, `org.loadFailed`, no current-context request.
4. Viewer hypothetical active-state metadata: history/code links visible, runner absent, notes editable, Save absent.
5. Viewer endpoint list: favorite/share controls visible, export absent, two restricted endpoints incorrectly counted as one unique endpoint.
6. Viewer governance detail: validation-run Delete visible with no `governance.manage`.
7. Viewer notification bell: mark-all visible, click invokes markRead, restricted type suppresses share navigation.
8. Viewer dashboard: two system groups collapse into one redacted-name bucket.

Runner: Angular CLI `test --watch=false --browsers=ChromeHeadless` with a focused `--include` for the temporary audit spec. ChromeHeadless 154 on Windows executed all eight successfully. These are mocked component/guard probes, not live SQL-backed user sessions.

## Preservation and cleanup

Final SELECT-only verification succeeded against `DESKTOP-NT1M6V7 / TWKEndpointsHub_MigrationTest`:

| Measure | Before | After |
|---|---:|---:|
| Roles | 6 | 6 |
| Permissions | 19 | 19 |
| RolePermissions | 48 | 48 |
| Owner grants | 8 | 8 |
| Admin grants | 4 | 4 |
| Developer grants | 1 | 1 |
| Viewer grants | 6 | 6 |
| Lifecycle definitions / grants | 0 / 0 | 0 / 0 |
| Captured tables / application rows | 41 / 231 | 41 / 231 |

All 48 composite grant identities, catalog and captured application fingerprints match certification. Applied migration history is unchanged; no pending migration/model changes were reported. Persistent application/catalog delta is **zero**. No grants, identities, memberships, schema or data were changed during this audit; no migrations were run; the original database was never connected to.

The isolated Angular development server was stopped. Its browser's synthetic storage was cleared and the page moved to `about:blank`; request interceptions were removed. The temporary audit spec was removed from application source. Only this report persists in the application workspace.

## Acceptance validation still required

After separately approved source changes, validate actual login, organization switching, navigation, management commands, read-only controls, revoked membership and cross-organization behavior using supplied real-role accounts in an isolated environment. If none exist, request explicit approval for cleanup-safe actors or use a separately disposable copy.

Do not call the current audit a completed real-user acceptance test. Backend certification passed; Angular journeys do not yet satisfy the provisioned roles.

## Principal source references

- [Routes](src/app/app.routes.ts), [organization guard](src/app/core/guards/organization.guard.ts), [organization context](src/app/core/services/organization-context.service.ts), [sidebar](src/app/layout/sidebar/sidebar.component.ts)
- [Login](src/app/features/auth/login/login.component.ts), [organization switcher](src/app/shared/components/organization-switcher/organization-switcher.component.ts)
- [Teams](src/app/features/teams/teams.component.ts), [systems](src/app/features/systems/systems.component.ts), [environments](src/app/features/environments/environments.component.ts)
- [Endpoint list](src/app/features/endpoints/endpoint-list/endpoint-list.component.ts), [list actions](src/app/features/endpoints/endpoint-list/endpoint-list.component.html), [detail actions](src/app/features/endpoints/endpoint-detail/endpoint-detail.component.html)
- [Governance detail](src/app/features/governance/governance-detail/governance-detail.component.html), [notification bell](src/app/shared/components/notification-bell/notification-bell.component.ts), [dashboard](src/app/features/dashboard/dashboard.component.ts), [API mappings](src/app/core/services/api.service.ts)
- [Organization read contract](../endpoint_hub_api/src/Application/Features/Organizations/OrganizationReadService.cs), [Viewer projection](../endpoint_hub_api/src/Application/Common/Authorization/ViewerContentPolicy.cs), [endpoint controller](../endpoint_hub_api/src/Api/Controllers/EndpointsController.cs)
- [Checkpoint 10.10 live certification report](../endpoint_hub_api/src/Infrastructure.BaselineMigrations/LIVE-ORGANIZATION-ROLE-VALIDATION-CHECKPOINT-10-10.md)
