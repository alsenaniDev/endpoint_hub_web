import { environment } from '../../../environments/environment';
import { Organization, OrganizationContext } from '../models/organization';

export const testUser = {
  userId: 'test-user-a', username: 'Owner A', role: 'SuperAdmin',
  accessToken: 'test-only-token', refreshToken: 'test-only-refresh', permissions: ['users.manage', 'governance.manage']
};
export const organizationA: Organization = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Workspace A', type: 'Shared', slug: 'a',
  membership: { id: 'member-a', userId: testUser.userId, state: 'Active', isReadOnly: false, teamId: null,
    role: { id: 'owner-role', name: 'Organization Owner', description: null } }
};
export const organizationB: Organization = {
  ...organizationA, id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Workspace B', slug: 'b',
  membership: { ...organizationA.membership, id: 'member-b',
    role: { id: 'member-role', name: 'Organization Member', description: null } }
};
export const testContext = (organization: Organization): OrganizationContext => ({
  organization, permissions: ['teams.view', 'systems.view', 'systems.manage', 'environments.view',
    'environments.manage', 'endpoints.view', 'endpoints.manage', 'swaggersync.view']
});
export const apiBase = environment.apiUrl;
export const settleAsync = () => new Promise<void>(resolve => setTimeout(resolve, 0));
