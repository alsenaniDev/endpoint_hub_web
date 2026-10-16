import { requiresOrganization } from './auth.interceptor';

describe('organization header routing', () => {
  it('does not require an active organization for token-bound invitation acceptance', () => {
    expect(requiresOrganization('organization-invitations/accept')).toBeFalse();
  });

  it('continues to require an active organization for ordinary organization APIs', () => {
    expect(requiresOrganization('organizations/current/members')).toBeTrue();
    expect(requiresOrganization('organizations/current/invitations')).toBeTrue();
  });
});
