import { routes } from '../../app.routes';

describe('Saved-test secret access route contract', () => {
  it('requires the separate execution capability rather than catalogue viewing', () => {
    const shell = routes.find(route => route.path === '' && route.children);
    const savedTests = shell?.children?.find(route => route.path === 'embedded-test');
    expect(savedTests?.data?.['permission']).toBe('endpoints.run');
  });
});
