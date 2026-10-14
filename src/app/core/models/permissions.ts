export const P = {
  Teams: { View: 'teams.view', Manage: 'teams.manage' },
  Systems: { View: 'systems.view', Manage: 'systems.manage' },
  Environments: { View: 'environments.view', Manage: 'environments.manage' },
  Endpoints: { View: 'endpoints.view', Manage: 'endpoints.manage', Run: 'endpoints.run' },
  AuthProfiles: { View: 'authprofiles.view', Manage: 'authprofiles.manage' },
  SwaggerSync: { View: 'swaggersync.view', Run: 'swaggersync.run', ManageSchedule: 'swaggersync.manageschedule' },
  Users: { Manage: 'users.manage' },
  Export: { View: 'export.view' },
} as const;
