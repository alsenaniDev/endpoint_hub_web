# TWK Endpoints Hub - Feature Inventory

This inventory was prepared from the current frontend and backend projects before creating the executive presentation.

## Fully implemented

- Authentication and authorization: JWT login, roles, and permission-based guards.
- Organization hierarchy: teams, systems, and environments with ownership.
- Endpoint discovery: search/filtering plus endpoint metadata, parameters, headers, bodies, responses, and deprecation state.
- Swagger/OpenAPI synchronization: parsing, create/update, new/deleted/modified/unchanged tracking, sync logs, and recurring Hangfire schedules.
- Request runner: environment selection, parameters, headers, bodies, auth profiles, response capture, and request history.
- Auth Profiles: No Auth, Bearer Token, API Key, Basic Auth, Custom Header, and Auto Login Token; encrypted secret storage is implemented.
- Favorites and sharing: user/team sharing, favorite endpoints, unread/shared state, and notifications.
- Change history: schema snapshots and endpoint change records.
- TypeScript and Angular code generation.
- Endpoint export/documentation data export.
- Notifications: persistent notification center and SignalR real-time delivery.
- Governance and compliance: standards, seven rule types, scoped assignments, validation runs, severity results, scores, and suggested fixes.
- Dashboard: teams, systems, environments, endpoints, change counts, broken Swagger URLs, and recent sync logs.
- User and role management.
- Profile management and password change.
- Embedded HTTP tests, saved tests, and HMAC signing support.
- English and Arabic localization.
- Structured backend logging with Serilog and Seq configuration.

## Partially implemented or bounded

- Background scheduling is implemented for Swagger synchronization; no broader job-management UI was found.
- Database seeding initializes roles/permissions, while the migration path is not fully established in the current project state.

## Not found in the current codebase

- Unit or end-to-end test suites.
- APM, caching, rate limiting, or performance dashboards.
- Retention policies, backup/restore, bulk import, or soft-delete workflows.
- Slack, Teams, Jira, or other external connectors.
- Webhooks, advanced lifecycle/deprecation management, and usage analytics.

## Presentation note

The PowerPoint uses evidence-based UI illustrations and product diagrams. They are designed from the implemented frontend flows and should not be mistaken for runtime screenshots of seeded production data.
