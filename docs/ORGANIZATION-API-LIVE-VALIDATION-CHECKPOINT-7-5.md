# Checkpoint 7.5 - live organization API validation

## Outcome

Executed on 2026-10-03 UTC against actual Kestrel and SQL Server.
All **52 HTTP status/required-shape/SQL-backed assertions passed**.
The initial nullable-field finding has now been resolved in Angular without
changing the backend contract or database values. **37/37 Angular tests and the
Angular development build passed.** All 41 tables were reconciled against the
authoritative post-Checkpoint-6 fingerprints and freshly verified read-only:
**217 rows, with no unexpected changes**. Checkpoint 7.5 is passed within this
defined scope. See section 11 for the contract fix and 209/217 reconciliation.

Only `DESKTOP-NT1M6V7 / TWKEndpointsHub_MigrationTest` was connected to.
The original `TWKEndpointsHub` database was not connected to or modified.

## 1. Actual HTTP results

| Request | Cases | Results |
|---|---:|---|
| POST /api/auth/login | 3 | 200; actual SQL-backed temporary users |
| GET /api/organizations, including query/header manipulation | 7 | 200 for authenticated discovery; 401 unauthenticated |
| GET /api/organizations/current | 17 | Correct 200 context, 400 invalid context, 403 nonmembership, 401 unauthenticated |
| GET /api/organizations/current/members | 12 | Correct 200 directory, 400 invalid context, 403 nonmembership, 401 unauthenticated |
| GET /api/organizations/current/roles | 12 | Correct 200 scoped roles, 400 invalid context, 403 nonmembership, 401 unauthenticated |
| GET /api/users/roles with misleading platform claims | 1 | 403; global catalog unavailable |
| **Total** | **52** | **52 passed; 0 failed assertions** |

Status totals: 20 x 200, 4 x 401, 12 x 400, 16 x 403.
There were 49 GET assertions plus three real logins.
Missing, malformed, empty-GUID and duplicate organization headers each returned
400 on all three context-dependent APIs. Discovery deliberately does not require
an active organization header.

## 2. Actual SQL-backed results

Each positive context/directory response was checked against live SQL membership,
role or grant queries rather than mock results. The 12-row temporary graph was:

- Three temporary users, all with the same existing Legacy Developer identity role.
- Two organizations and two teams.
- Four memberships: A-only actor, B-only actor and a switching actor in both.
- One temporary organization Viewer role, with zero grants.

Organization A memberships used the existing Owner role/eight grants.
Organization B memberships used Viewer/zero grants. No existing membership,
Users.RoleId, platform flag, permission definition or grant was changed.
Real logins updated only the temporary users.

## 3. Organization isolation

- A-only actor discovered only A; B-only actor discovered only B.
- A actor using B, and B actor using A, received 403 on context, members and roles.
- Unknown organization IDs received 403, not a membership bypass.
- Discovery query/header attempts could not request another user's memberships.
- A and B member directories contained only their own SQL-backed members.
- Role directories returned only roles used by valid members of the selected
  organization: Owner in A, Viewer in B; neither global nor opposite-directory roles.

Shared membership of the switching actor was intentional, not cross-tenant leakage.

## 4. Membership/role authority

The same switching token returned Owner/eight permissions in A, Viewer/zero
permissions in B, then Owner/eight permissions again in A. Its A membership had
no team; its B membership had B's team.

All fixture identity RoleIds remained Legacy Developer. This demonstrates that
Users.RoleId did not supply organization role/permission authority.

Validation-only signed tokens with misleading SuperAdmin, platform, permission
and organization claims could not change database-backed discovery, context or
permission results, bypass nonmembership, or expose the global role catalog.

The existing platform administrator was tested without login, preserving its
LastLogin. Its discovery returned only its actual Existing Workspace membership;
its platform flag did not permit fixture organization context/members/roles.

## 5. Initial frontend/backend contract validation

Required organization list, active membership, organization role, permission
array, member list and role directory shapes matched. Enum values were strings,
and membership state was `Active`, as expected by Angular.

**Confirmed mismatch: explicit JSON null is not an optional TypeScript string.**

| Actual response field | Actual backend value | Current Angular declaration |
|---|---|---|
| OrganizationRole.description, including nested membership/member roles | null | description?: string |
| OrganizationMembership.teamId | null | teamId?: string |
| OrganizationMember.fullName | null | fullName?: string |

The evidence records five affected response paths across these three fields.
The mismatch does not demonstrate an authorization bypass, but the current
frontend types do not accurately describe the real wire contract. Current UI
tolerance of null is not contract certification.

This initial finding was reported before any production contract changes.
It is now resolved by section 11; the API was not changed to omit or invent
values merely to pass validation. Original live evidence remains unchanged.

## 6. Fixture cleanup verification

Cleanup deleted exactly four memberships, two teams, two organizations, one
temporary role and three users in a transaction. All 12 rows were removed.
Independent verification checked absence of recorded fixture GUIDs.

The first attempt used an unsupported tagged organization role name and failed
the existing CK_Roles_Scope constraint before fixture commit or API assertions.
Its insertion transaction rolled back; independent verification confirmed all
original data/catalog/history unchanged. The failure evidence was retained.
After inspecting the actual constraint, the harness used the supported, absent
Viewer role name in a fresh independently gated attempt. The database constraint
and production contract were not altered.

## 7. Database preservation evidence

After the successful run and host shutdown, independent SELECT-only verification
confirmed:

- 41 original tables and 217 original rows.
- Every original table count/fingerprint unchanged.
- Catalog, constraints, indexes, triggers and migration history unchanged.
- RolePermissions remained 37; Owner remained exactly eight grants.
- Existing roles/grants, permissions, Users.RoleId and platform flags unchanged.
- Exactly two applied migrations; none pending; no pending model changes.
- No retained temporary fixture role or memberships.

The restricted host was stopped, the validation port was closed, the ephemeral
runtime credential manifest was removed, and the retained fixture password was
cleared. No migrations, grant writes, invitations, HangFire storage/workers or
SignalR endpoints were executed/enabled.

Logical data/catalog preservation does not mean a byte-identical database:
temporary transactions affect the transaction log and global rowversion counter.

## 8. API contract problems

The initial problem was frontend nullable-field typing described above, now
resolved in section 11.
No required response-shape or tested authorization mismatch was found.
Creation, invitation lifecycle and membership writes remain outside these
read-only APIs and were not added or certified.

## 9. Backend build

The live harness build also built Domain, Application, Infrastructure,
Infrastructure.BaselineMigrations and Api successfully:
**0 errors, 0 warnings**. Live API tests used no mocks.

Initial live-validation changes were limited to the harness and documentation:
FixturePlan.cs, Program.cs, OrganizationApiHttpTests.cs and the harness README.
Production backend and frontend code were not modified during that initial run.
The subsequent approved Angular type/test changes are recorded below.

## 10. Frontend build / remaining limits

At initial live execution, frontend code was not modified and its build was not
rerun. The subsequently approved contract fix was tested and built as recorded
below; Checkpoint 7's older build is not substituted for this validation.

HangFire, SignalR tenant isolation, additional permissions and concurrency
mitigation remain deferred. The previously documented tracked UPDATE/DELETE
authorization/write race remains unresolved. These GET checks do not certify
full concurrency safety or unrelated mutation/execution paths.

## Retained evidence

Successful attempt:
`C:\Users\HP 1\.copilot\session-state\0221246b-5a42-49e9-83f7-9cbbc126ee22\files\auth75-live`

- auth75-http-results.json: all 52 expected/actual HTTP results and response digests.
- auth75-response-evidence.json: successful response payloads, excluding credentials.
- auth75-sql-backed-verification.json: live identities, memberships and grant counts.
- auth75-frontend-contract.json: required-shape success and explicit nullability findings.
- auth5-preservation.json and auth5-independent-verification.json: cleanup and
  independent complete original-data/catalog/history preservation.
- auth5-http.sql and auth5-relational.sql: executed SQL evidence without parameter values.

Rolled-back initial attempt:
`C:\Users\HP 1\.copilot\session-state\0221246b-5a42-49e9-83f7-9cbbc126ee22\files\auth75`

## 11. Approved contract fix and data-count reconciliation

Completed on 2026-10-03 UTC after the user requested resolution of both items.

### Angular contract fix

The wire fields are present and nullable, not merely optional:

- OrganizationRole.description: required `string | null`, also covering nested roles.
- OrganizationMembership.teamId: required `string | null`.
- OrganizationMember.fullName: required `string | null`.

No null-to-empty-string coercion, invented data, backend response change or
database-value change was introduced. Existing templates already handle null:
member labels use the real backend username when FullName is unavailable, and
role descriptions are conditional. No template edit was needed.

Updated files:

- ../src/app/core/models/organization.ts
- ../src/app/core/services/organization.fixtures.spec.ts
- ../src/app/core/services/organization-context.service.spec.ts
- ../src/app/features/organizations/organizations.component.spec.ts

Shared test responses now include explicit null fields. Three new regressions
verify null preservation through discovery/current state, preservation of
non-null team/description values, and null member/role rendering without
changing stored values.

Validation:

- `npm run test:ci` with ChromeHeadless: **37/37 passed**, including existing
  tenant switching, stale-state, interceptor, route and directory tests.
- `node .\node_modules\@angular\cli\bin\ng.js build --configuration=development`:
  **passed**, no type/template compilation errors. Existing unused-file and
  component stylesheet-budget warnings remain; they were not changed here.

The original auth75-frontend-contract.json intentionally records the pre-fix
finding; it has not been rewritten to misrepresent the initial live run.
The live harness checker and its README were also aligned with the corrected
required-nullable fields for future runs: null is accepted, while missing or
incorrectly typed fields fail after recording evidence. No live fixture
insertion/API rerun was performed during this read-only reconciliation.

### Exact source of the eight-row difference

This is **not** a different projection definition or an unexplained fixture
delta. It compares two different points in the approved grant timeline.

| Point in time | All 41 tables, physical rows | RolePermissions | Owner grants |
|---|---:|---:|---:|
| Checkpoint 6 before approved grants | 209 | 29 | 0 |
| Checkpoint 6 after approved grants and cleanup | 217 | 37 | 8 |
| Checkpoint 7.5 before fixtures | 217 | 37 | 8 |
| Current independently verified state | 217 | 37 | 8 |

The authoritative retained Checkpoint-6 independent verification at
2026-10-02T23:35:57.5620287Z states **217 rows**, not 209.
The retained Owner grant application report explicitly labels **209 pre-grant**
and **217 post-grant**. Any statement of 209 as the final post-Checkpoint-6
total is a timing/reporting error, not the verified post-grant state.

Exactly eight expected permanent rows were inserted into dbo.RolePermissions
by the approved Checkpoint-6 grant transaction at
2026-10-02T23:28:20.9898606Z. Every row uses Owner role
`bdf04574-2f30-450f-bd34-350c47302127`:

| Permission | PermissionId |
|---|---|
| teams.view | 9f9ac7e1-04a1-44c1-8982-8be29792e5b9 |
| systems.view | 84d2ea17-32be-4e38-b860-573034103f67 |
| systems.manage | 4758a839-63fd-4bee-88a1-442c4cdef03f |
| environments.view | f7f0402d-e804-42c5-991b-e72abf5d9d78 |
| environments.manage | 9c179fbf-c4b2-4a2a-8325-430f6d94e1ac |
| endpoints.view | c0d195c6-9e05-4478-8a71-a1d9b622a9c3 |
| endpoints.manage | b6fb20c9-c986-4879-ba30-b3aae71b258b |
| swaggersync.view | 47c07a9c-c529-4503-86a6-be72971cd16f |

The post-grant mapping set equals all 29 original pairs plus exactly these
eight committed pairs. All other 40 tables have identical pre/post-grant
counts and fingerprints.

These rows already existed before Checkpoint 7.5. Neither its rolled-back
fixture attempt, successful 12-row fixture graph, setup nor cleanup created
them. The temporary graph brought 217 to 229 rows; cleanup restored 217.
No records were changed/deleted to make totals match.

### All-table reconciliation and current database verification

Compared the exact count, column list and ContentSha256 for every table from:

1. Checkpoint-6 approved grant-after snapshot.
2. Checkpoint-6 final post-fixture snapshot.
3. Checkpoint-7.5 preflight snapshot.
4. Checkpoint-7.5 post-cleanup snapshot, whose identical state was rechecked
   against the actual database by independent SELECT-only verification at
   2026-10-03T01:14:29.8493346Z.

**Every one of all 41 tables matched the authoritative post-Checkpoint-6
state exactly.** No unexpected rows, updates, deletions or schema/history
changes were found. RolePermissions stayed 37, Owner stayed eight; roles,
permission definitions and all business data fingerprints remained unchanged.
Both migration IDs remain applied; none pending; no model changes.

Per-table counts and SHA-256 fingerprints, exact approved insertion pairs,
the grant timestamp and catalog comparison are retained in:

`C:\Users\HP 1\.copilot\session-state\0221246b-5a42-49e9-83f7-9cbbc126ee22\files\auth75-reconciliation\data-count-reconciliation.json`

Only MigrationTest was accessed, read-only, during this reconciliation.
No API host, migrations, grant changes, invitations, HangFire or SignalR were
started. Original TWKEndpointsHub remains untouched.

**STOP: all six requested completion conditions are satisfied. Checkpoint 7.5
passes only within this approved scope; deferred work and the unresolved
authorization/write race remain unchanged.**
