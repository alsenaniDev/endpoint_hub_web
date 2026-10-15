# Endpoints Hub

This application uses Angular 16.2 standalone components and signals.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute browser unit/integration tests with Angular CLI, Karma and Jasmine, use:

```bash
ng test
```

For a single headless run:

```powershell
$env:CHROME_BIN = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:ci
```

## Organization context

The centralized `OrganizationContextService` loads live memberships from
`GET /api/organizations`, then validates the selected membership with
`GET /api/organizations/current`. A persisted user-specific selection is restored
only when it remains in the returned membership list. Otherwise the first valid
backend-returned membership is selected; an empty list never invents a workspace.

The API interceptor overwrites `X-Organization-Id` for tenant requests from this
state. Identity, organization discovery and platform user requests do not need a
tenant header. Credentials are not automatically attached to assets or other
origins. The backend is always the security boundary.

Switching cancels old tenant HTTP subscriptions and increments the shell's
render epoch. Its routed components are destroyed/recreated even if the new
context arrives before change detection. Notifications clear synchronously and
reload through scoped HTTP; user-only SignalR subscriptions are disabled pending
the separate realtime-tenancy checkpoint.

Organization roles/permission hints come from the current server membership,
not the stored login role/JWT. Members and roles are read-only. Organization
creation/editing, member changes and invitation creation/listing/acceptance are
explicitly unavailable until their backend lifecycles are approved. Invitation
tokens are not read or displayed.

For this checkpoint, do not launch the normally configured backend. Use only its
`RelationalValidation` environment with both environment names and the explicit
MigrationTest connection override described in the backend live-validation
instructions. Frontend unit tests use `HttpTestingController` and do not connect
to SQL Server. Existing deployment configurations are not retargeted by this work.

Development build:

```powershell
node .\node_modules\@angular\cli\bin\ng.js build --configuration=development
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
