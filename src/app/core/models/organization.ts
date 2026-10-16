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

export interface OrganizationInvitation {
  readonly id: string;
  readonly email: string;
  readonly roleName: string;
  readonly status: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly acceptedAt: string | null;
  readonly invitedByUserId: string;
}

export interface OrganizationLifecycleResult {
  readonly outcome: string;
  readonly organizationId: string;
  readonly membershipId: string | null;
  readonly roleName: string | null;
}

export const organizationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function apiErrorKey(status: number, message?: unknown): string {
  const code = typeof message === 'string' ? message : '';
  if (status === 409) {
    switch (code) {
      case 'InvitationDeliveryUnavailable': return 'org.deliveryUnavailable';
      case 'InvitationExpired': return 'org.invitationExpired';
      case 'InvitationCancelled': return 'org.invitationCancelled';
      case 'InvitationAlreadyAccepted': return 'org.invitationAlreadyAccepted';
      case 'InvitationIssuerNoLongerAuthorized': return 'org.invitationIssuerUnavailable';
      case 'AlreadyMember': return 'org.alreadyMember';
      case 'PendingInvitationExists': return 'org.pendingInvitationExists';
      case 'FinalOwnerRequired': return 'org.finalOwnerRequired';
      case 'MembershipUnavailable': return 'org.membershipUnavailable';
      case 'AssignableRoleUnavailable': return 'org.assignableRoleUnavailable';
      default: return 'org.deferred';
    }
  }
  switch (status) {
    case 401: return 'org.sessionExpired';
    case 400: return 'org.invalidContext';
    case 403: return 'org.forbidden';
    case 404: return 'org.unavailable';
    default: return 'org.requestFailed';
  }
}
