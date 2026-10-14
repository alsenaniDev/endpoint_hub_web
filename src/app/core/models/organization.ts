export interface OrganizationRole {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
}

export interface OrganizationMembership {
  readonly id: string;
  readonly userId: string;
  readonly teamId: string | null;
  readonly role: OrganizationRole;
  readonly state: 'Active';
  readonly isReadOnly: boolean;
}

export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: string;
  readonly membership: OrganizationMembership;
}

export interface OrganizationDiscovery {
  readonly organizations: readonly Organization[];
  readonly canManageUsers: boolean;
}

export interface OrganizationContext {
  readonly organization: Organization;
  readonly permissions: readonly string[];
}

export interface OrganizationMember {
  id: string;
  userId: string;
  username: string;
  fullName: string | null;
  role: OrganizationRole;
  state: 'Active';
}

export const organizationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function apiErrorKey(status: number): string {
  switch (status) {
    case 401: return 'org.sessionExpired';
    case 400: return 'org.invalidContext';
    case 403: return 'org.forbidden';
    case 404: return 'org.unavailable';
    case 409: return 'org.deferred';
    default: return 'org.requestFailed';
  }
}
