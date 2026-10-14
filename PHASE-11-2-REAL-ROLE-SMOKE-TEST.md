# Phase 11.2 - Real Organization Role Smoke Test

## Outcome and scope

**Completed, with the observed defects corrected and retested.** Native Angular login, live SQL-backed organization bootstrap, authorized navigation/actions, denied routes/actions, explicit backend error handling, organization switching and logout were exercised. No permissions, RolePermissions, Owner grants, lifecycle definitions, schema or migration history were changed.

The only database used was `DESKTOP-NT1M6V7 / TWKEndpointsHub_MigrationTest`. The original `TWKEndpointsHub` database was not connected to. Final independent preservation verification completed at **2026-10-03T23:38:15Z**.

This is a browser smoke matrix, not an automated end-to-end runner claiming one test for every DOM assertion. Native browser/HTTP evidence is distinguished below from Angular/backend regression evidence. No API response mocks or fabricated authentication were used for the successful journeys.

## Fixture and authentication strategy

- Three temporary native-login users: Organization Admin, Developer and Viewer.
- Two temporary organizations: Admin and Developer belonged only to A; Viewer belonged to A and B.
- Four memberships used the existing deterministic Organization-scoped roles and existing grants.
- The minimal recorded graph contained 45 temporary rows, including resources needed for structural catalogue, saved-test, notification and governance checks.
- Original baseline: 41 captured tables and 231 rows. During each fixture run: 276 rows. After cleanup: exactly 231 rows.
- Existing real admin membership was untouched. Management writes targeted only recorded temporary rows.
- Two sequential fixture runs were used. The first was fully cleaned and independently certified before the clean retest began.
- Harness cleanup used exact fixture identities, an explicit SERIALIZABLE transaction, original fingerprints/catalog/grant verification before commit, and independent verification afterward.
- Test passwords were removed from fixture metadata after certification. All actors logged out, browser storage was cleared, both owned hosts stopped, and isolated normalizer build outputs were removed.

Each live context returned an **Active** membership and the proper scoped role. Viewer retained `isReadOnly: true`. All three users had a global/legacy Developer hint; it did not override the actual Organization role or grants.

| Actor | Live Organization role identity | Effective keys | Initial destination |
|---|---|---|---|
| Admin | `a538171c-4dde-4d69-9913-569ab5ed6be1` | `teams.manage`, `systems.manage`, `environments.manage`, `endpoints.manage` | Management |
| Developer | `0e4e095a-c1d7-4946-9b13-784b496018b7` | `endpoints.manage` | Management |
| Viewer | `88ca6a6c-ab89-4916-b98d-26d5204f0f1f` | `teams.view`, `systems.view`, `environments.view`, `endpoints.view`, `swaggersync.view`, `governance.view` | Dashboard |

## Admin results

### Positive native browser/API evidence

The management-only workspace rendered without catalogue-read grants. Its resource options were Teams, Systems, Environments, Swagger sources and Endpoints. Five actual UI submissions returned HTTP 200:

| UI operation | Permission exercised | Result |
|---|---|---|
| Replace temporary Team A fields | `teams.manage` | 200; success rendered |
| Replace temporary System A fields | `systems.manage` | 200; success rendered |
| Replace temporary Environment A fields | `environments.manage` | 200; success rendered |
| Replace temporary Swagger source configuration | `environments.manage` | 200; success rendered; no sync executed |
| Replace temporary endpoint notes | `endpoints.manage` | 200; success rendered |

Native reload preserved the authenticated session. Organization selection, Profile and invitation-acceptance screens rendered. The latter explicitly reports its unsupported backend operation; rendering it is not evidence of successful invitation acceptance.

### Excluded capabilities

Seventeen native negative probes produced the expected outcomes:

- Six catalogue reads: HTTP 403.
- Platform users; AuthProfile read/destruction; saved-test collection; endpoint runner; Swagger execution; governance run/destruction: HTTP 403.
- Foreign endpoint notes: HTTP 404.
- Organization B header without membership: HTTP 403.
- Missing organization header: HTTP 400.

Fifteen forbidden direct URL cases landed on access-denied. Management authority did not imply catalogue view, execution, credential access or platform authority.

A protected System deletion also returned HTTP 403 because the operation would destroy AuthProfile-related data without `authprofiles.manage`. Feature and shell errors were explicit; no success was displayed. This is an intentional capability boundary, not a permission to add.

Logout removed authentication, user-specific organization selection and the management view.

## Developer results

### Positive native browser/API evidence

The initial destination was Management. The only resource option was Endpoints and the only operation was endpoint notes. A real notes submission returned HTTP 200 without refreshing or reading the endpoint catalogue.

### Excluded capabilities

Nineteen native negative probes produced expected outcomes:

- Six catalogue reads; Team/System/Environment management; platform users; AuthProfile read/destruction; saved-test collection; endpoint runner; Swagger execution; governance execution: HTTP 403.
- Foreign endpoint notes: HTTP 404.
- Organization B header without membership: HTTP 403.
- Missing organization header: HTTP 400.

Fifteen forbidden direct URL cases landed on access-denied. In particular, `endpoints.manage` did not provide `endpoints.view`, `endpoints.run` or saved-test token retrieval.

An initial-run UI notes request with a deliberately wrong organization header returned a real backend 403: explicit feature error, no success and fail-closed context. The temporary header override was restored in `finally`; it did not mock a response.

Organization selection, Profile and invitation-acceptance screens rendered. Logout removed authentication, selection and tenant views.

## Viewer results

### Positive native browser/API evidence

Viewer bootstrapped into Dashboard with all six exact view keys and structural-only effect metadata. Dashboard system IDs/counts rendered correctly. Teams, Systems, Environments, endpoint catalogue/detail, Swagger status, API standards, standard detail and compliance report returned HTTP 200 and rendered.

After valid fixture enum correction, the eight module/detail/report screens and endpoint detail were retested with **zero rendering TypeErrors**. The endpoint response contained `method: "GET"` and parameter location `"Query"`; all five detail tabs rendered.

Structural restrictions were observed in the actual UI:

- Endpoint notes and used-in-pages remained `[restricted]`.
- Notes were readonly; zero save controls.
- No execution, history or generated-code links.
- Expanded endpoint catalogue contained no mutation buttons or forbidden links.
- No sensitive canary or management-supplied arbitrary notes were reconstructed in Viewer content.
- Shared-with-me and Favorites filters issued reads, not sharing/favorite/seen-state mutations.
- Notification click issued no mutation. The own notification remained `isRead: false`; message remained restricted; mark-all-read control was absent.
- Empty dashboard states no longer offered environment creation.

### Excluded capabilities

Twenty-four native negative probes produced expected outcomes:

- Four catalogue mutations; saved-test read; endpoint execution; Swagger execution; AuthProfile read/manage; platform users; favorite/share/seen mutations; individual/all notification read mutations; change history; governance run/manage; generated code; execution history; export; schedule management: HTTP 403.
- Foreign endpoint: HTTP 404.
- Unknown/unmember organization header: HTTP 403.

Eight forbidden direct URL cases landed on access-denied: Management, endpoint execution, history, generated code, embedded tests, AuthProfiles, platform users and governance validation.

The allowed Teams UI was also made to send a real request with an unknown organization header. HTTP 403 was surfaced explicitly; previous team data was not left visible; authentication was retained. The override was restored.

Organization selection, Profile and invitation-acceptance screens rendered without catalogue canaries. Logout removed authentication, selection and all tenant screens.

## Cross-organization and switching results

| Live scenario | Result |
|---|---|
| Viewer A resource under A context | Authorized structural response |
| Switch A to B | Dashboard showed System B, not System A |
| Viewer B endpoint under B context | HTTP 200 |
| A endpoint requested under B header | HTTP 404 |
| B endpoint requested under A header | HTTP 404 |
| Admin/Developer using B header | HTTP 403; no membership |
| Viewer using unknown organization header | HTTP 403 |
| B endpoint list | Only B resource identifiers visible |
| Switch away from A detail | Old detail and A resource identifiers removed |
| Retest after switching fix | Zero foreign-resource reload requests, zero API failures, zero stale error banner |
| Switch B back to A | Correct scoped content restored |

An initial switching race was reproduced: the new context became ready before neutral navigation completed, causing an old resource component to reload under the new scope. The backend correctly denied it with 404; no cross-tenant data was disclosed. The frontend now clears the old context first and completes neutral navigation before activating the new organization. The real browser retest confirmed the race and stale banner were gone.

## Failures, root causes and fixes

| Finding | Root cause | Resolution and verification |
|---|---|---|
| Apparent auth loss on reload in reused audit page | Persistent old browser initialization script replaced native auth | Used a fresh native browser page; real Admin reload passed. Tooling contamination, not an application auth defect |
| Logout retained user-specific organization preference | Context reset intentionally preserved ordinary reload selection, but logout reused it | Explicit logout selection clearing; Angular regression and native logout for all roles passed |
| Intermittent parallel-read HTTP 500 | Validation SQL interceptor instances used separate locks while appending to the same capture file | Process-wide lock; IO errors still propagate. Eight-instance/256-record regression; 21/21 native concurrent reads returned 200; retest host had zero capture IOExceptions |
| Endpoint enum rendering failure | Temporary fixture constructors omitted nonzero enum values; undefined zero serialized numerically | BrowserUi-only valid enum seeding plus guarded temporary-row normalization. No product GET fallback or fabricated DTO values |
| Viewer empty-state creation links | Dashboard template lacked the current permission/effect check | Both links gated by ready live management authority and mutation eligibility; readonly/no-manage/unready regression cases passed |
| Old resource reload during switching | New tenant context activated before neutral route navigation settled | Clear old state, await neutral navigation, then activate/select landing; delayed/cancelled-navigation regressions and native cross-organization retest passed |

The first enum normalization attempt expected all fixture enum fields to be zero. Admin had already validly changed Environment A to Development, so the guard **rolled back**. A subsequent exact eight-row correction preserved that environment and changed only remaining recorded temporary fixture fields. Original rows, catalog and all grants were verified unchanged before commit and independently afterward. Future BrowserUi fixtures seed valid enums directly.

No grants were added to overcome any failure.

## Files changed in this checkpoint

### Frontend

- [Organization context](src/app/core/services/organization-context.service.ts): logout preference clearing and explicit pending-switch state.
- [Auth service](src/app/core/services/auth.service.ts): use logout-specific clearing.
- [Context regressions](src/app/core/services/organization-context.service.spec.ts).
- [Dashboard component](src/app/features/dashboard/dashboard.component.ts): capability/effect-aware environment creation eligibility.
- [Dashboard template](src/app/features/dashboard/dashboard.component.html): gate both creation links.
- [Viewer usability regressions](src/app/features/endpoints/viewer-usability.spec.ts).
- [Organization switcher](src/app/shared/components/organization-switcher/organization-switcher.component.ts): ordered neutral navigation and fail-closed cancellation.
- [Role navigation regressions](src/app/core/guards/role-navigation.spec.ts).

### Backend and validation tooling

- [SQL capture interceptor](../twk_endpoint_hub_api/src/Api/Validation/RelationalValidationSqlInterceptor.cs): shared file serialization, not authorization changes.
- [SQL capture regressions](../twk_endpoint_hub_api/tests/TenantAuthorization.Tests/RelationalValidationSqlInterceptorTests.cs).
- [Browser fixture lifecycle](../twk_endpoint_hub_api/tests/TenantAuthorization.LiveValidation/AngularUiSmoke.cs).
- [Organization validation harness](../twk_endpoint_hub_api/tests/TenantAuthorization.LiveValidation/OrganizationRoleValidation.cs).
- [Browser fixture enums](../twk_endpoint_hub_api/tests/TenantAuthorization.LiveValidation/BrowserFixtureEnums.cs).
- [Validation entry point](../twk_endpoint_hub_api/tests/TenantAuthorization.LiveValidation/Program.cs).
- [Live validation project](../twk_endpoint_hub_api/tests/TenantAuthorization.LiveValidation/TenantAuthorization.LiveValidation.csproj).
- [Validation documentation](../twk_endpoint_hub_api/tests/TenantAuthorization.LiveValidation/README.md).
- [Browser fixture tests](../twk_endpoint_hub_api/tests/TenantAuthorization.Tests/AngularUiSmokeTests.cs).
- [Fixture enum regressions](../twk_endpoint_hub_api/tests/TenantAuthorization.Tests/BrowserFixtureEnumTests.cs).
- [Backend test project](../twk_endpoint_hub_api/tests/TenantAuthorization.Tests/TenantAuthorization.Tests.csproj).

No schema/migration files, permission definitions or grant mappings were changed. No new product DTO or authorization bypass was added.

## Validation totals and builds

| Validation | Before Phase 11.2 | Final result |
|---|---:|---:|
| Full Angular suite | 122 passed | **126 passed**, zero failures |
| Full backend authorization/regression suite | 263 passed | **272 passed**, zero failures/skips |
| Angular production build | Passing | **Passed**, nine existing warnings |
| Explicit API build | Passing | **Passed**, zero warnings/errors on final incremental build |
| Explicit live-validation build | Passing | **Passed**, zero warnings/errors on final incremental build |

The backend test compilation additionally emitted an existing unused-variable warning in the environment query handler. It was not hidden or fixed as unrelated work. Angular warnings remain unused-compilation inputs and existing component-style budgets.

Primary clean-retest smoke counts:

- All **11 approved role/permission combinations** positively exercised.
- **6 successful management UI writes**: five Admin, one Developer.
- **60 native negative capability/scope probes**: Admin 17, Developer 19, Viewer 24.
- **38 denied direct URL cases**: Admin 15, Developer 15, Viewer 8.
- **21/21 concurrent native reads** after capture fix.
- Additional live protected-deletion, feature-403, switching, readonly notification/filter and logout checks are described separately; they are not inflated into a runner test total.

Angular tests provide synthetic regression evidence for route/capability selection, readonly controls and navigation sequencing. Backend tests provide synthetic/pipeline regression evidence for the fixture lifecycle, enums, SQL capture and existing authorization safeguards. These runner totals do not imply all tests connected to SQL. The role/browser results above did use the actual isolated API and SQL-backed live authorization path.

## Cleanup and final preservation certificate

The first run certified restoration at 22:57:38Z. The second run completed normal guarded cleanup and independent certification at 23:38:15Z. Temporary users, memberships, organizations/resources and notification/history/governance fixtures were removed; no original membership or row was modified.

| Invariant | Before | After |
|---|---:|---:|
| Roles | 6 | **6** |
| Permissions | 19 | **19** |
| RolePermissions | 48 | **48** |
| Owner grants | 8 | **8** |
| Admin grants | 4 | **4** |
| Developer grants | 1 | **1** |
| Viewer grants | 6 | **6** |
| Lifecycle definitions | 0 | **0** |
| Lifecycle grants | 0 | **0** |
| Captured original tables | 41 | **41** |
| Original row total | 231 | **231** |
| Remaining temporary rows | 0 | **0** |

- All 41 original table fingerprints, including original rowversions, matched.
- All 48 composite grant identities were preserved.
- Complete captured catalog matched: schema unchanged.
- Migration history remained exactly `20261002014612_AdoptExistingSchema` and `20261002030613_ExpandTenantSchema`.
- Pending migrations: none. Pending EF model changes: false.
- Persistent application/catalog delta: **zero**.
- Database-wide `@@DBTS` necessarily advanced during temporary writes. It was not reseeded; this internal counter advance is explicitly outside the zero application/catalog delta claim.
- Original `TWKEndpointsHub` connected: **false**.
- No host remained listening on the owned validation ports after shutdown.

### Retained evidence

Evidence is retained in the session workspace, not as credential-bearing deliverables:

- [Sanitized clean-retest browser ledger](../../../.copilot/session-state/0221246b-5a42-49e9-83f7-9cbbc126ee22/files/auth112-ui-retest/auth112-browser-observations.json).
- [Independent final verification](../../../.copilot/session-state/0221246b-5a42-49e9-83f7-9cbbc126ee22/files/auth112-ui-retest/auth110-verification.json).
- [Restoration certificate and per-table hashes](../../../.copilot/session-state/0221246b-5a42-49e9-83f7-9cbbc126ee22/files/auth112-ui-retest/auth112-restoration-certificate.json).
- [Guarded temporary enum correction certificate](../../../.copilot/session-state/0221246b-5a42-49e9-83f7-9cbbc126ee22/files/auth112-ui-retest/auth112-enum-normalization-certificate.json).

Actual management success and Viewer readonly/redacted endpoint screenshots were displayed during browser validation. They are supplementary; no screenshot file is claimed as a separately saved artifact.

## Remaining product and validation limitations

1. **Known-ID management remains intentional.** Admin/Developer cannot discover resources through named raw catalogue selectors. Discovery or trusted text requires a separate content-policy/permission decision, not `manage OR view`.
2. **Live CRUD scope was constrained.** Recorded fixture replacements and protected deletion were tested. Create and unprotected-delete paths retain source/regression evidence but were not exhaustively submitted live, avoiding unrecorded cleanup graphs.
3. **AuthProfile-coupled destruction remains denied.** Removing that protection requires separately approved authority; it is not a usability fix.
4. **Lifecycle capabilities remain unavailable.** All three lifecycle definitions/grants remain zero. Invitation acceptance has no supported backend endpoint; no accepted-invitation success is claimed. Unsupported/405 routes from preliminary exploration are not counted as authorization denials.
5. **Realtime/background jobs were disabled.** Stored notification rendering and nonmutation were live-tested. Actual SignalR delivery was not certified here; the UI correctly reports realtime unavailable. Existing regression and prior checkpoint evidence are separate.
6. **No external network safety certification.** No Swagger destination or endpoint execution was approved or exercised. Successful configuration replacement does not approve a network destination.
7. **Browser environment scope.** Validation used localhost and isolated synthetic resources through real authentication/SQL. It is not an all-device or arbitrary production-content certification. Fixture compliance aggregate accuracy and notification timezone semantics were not audited.

**Stopped after validation, cleanup and reporting. No additional permissions or grants provisioned.**
