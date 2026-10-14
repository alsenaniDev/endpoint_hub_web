import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { OrganizationRealtimeService, REALTIME_CONNECTION_FACTORY, RealtimeConnection } from './organization-realtime.service';
import { OrganizationContextService } from './organization-context.service';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { NotificationService } from './notification.service';
import { ApiResponse, AppNotification } from '../models/models';
import { organizationA, organizationB, settleAsync } from './organization.fixtures.spec';

class TestConnection implements RealtimeConnection {
  event: ((event: unknown) => void) | null = null;
  reconnecting = () => {};
  reconnected = () => {};
  closed = () => {};
  start = jasmine.createSpy('start').and.resolveTo();
  stop = jasmine.createSpy('stop').and.resolveTo();
  invoke = jasmine.createSpy('invoke').and.resolveTo();
  on(_method: string, handler: (event: unknown) => void) { this.event = handler; }
  off(_method: string) { this.event = null; }
  onreconnecting(handler: () => void) { this.reconnecting = handler; }
  onreconnected(handler: () => void) { this.reconnected = handler; }
  onclose(handler: () => void) { this.closed = handler; }
}

describe('Tenant realtime lifecycle', () => {
  const id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  let service: OrganizationRealtimeService;
  let changes: Subject<void>;
  let connections: TestConnection[];
  let urls: string[];
  let tokens: (() => string)[];
  let ready: ReturnType<typeof signal<boolean>>;
  let active: ReturnType<typeof signal<string | null>>;
  let revision: ReturnType<typeof signal<number>>;
  let refresh: jasmine.Spy;
  let logout: jasmine.Spy;
  let response: Subject<ApiResponse<AppNotification[]>>;
  let getNotifications: jasmine.Spy;
  let nextStart: (() => Promise<void>) | null;
  const notice = (org = organizationA.id): AppNotification & { organizationId: string } => ({
    organizationId: org, id, message: 'Tenant notice', type: 'share', isRead: false,
    createdAt: '2026-10-03T00:00:00Z', relatedEntityId: null
  });
  beforeEach(() => {
    changes = new Subject<void>();
    connections = []; urls = []; tokens = [];
    nextStart = null;
    ready = signal(true); active = signal<string | null>(organizationA.id); revision = signal(1);
    refresh = jasmine.createSpy('revalidate').and.resolveTo();
    logout = jasmine.createSpy('logout');
    response = new Subject<ApiResponse<AppNotification[]>>();
    getNotifications = jasmine.createSpy('getNotifications').and.callFake(() => response);
    TestBed.configureTestingModule({ providers: [
      { provide: OrganizationContextService, useValue: {
        changes$: changes, ready, activeOrganizationId: active, revision, revalidate: refresh,
        reportApiError: jasmine.createSpy('reportApiError')
      } },
      { provide: AuthService, useValue: { getToken: () => 'current-token', logout } },
      { provide: ApiService, useValue: { getNotifications } },
      { provide: REALTIME_CONNECTION_FACTORY, useValue: (url: string, token: () => string) => {
        const connection = new TestConnection();
        if (nextStart) connection.start.and.callFake(nextStart);
        connections.push(connection); urls.push(url); tokens.push(token);
        return connection;
      } }
    ] });
    service = TestBed.inject(OrganizationRealtimeService);
  });
  afterEach(() => service.stop());

  it('uses only centralized organization context and authenticates then validates', async () => {
    service.start(); service.start();
    await settleAsync();
    expect(connections.length).toBe(1);
    expect(urls[0]).toContain(`organizationId=${organizationA.id}`);
    expect(urls[0]).not.toContain('group');
    expect(tokens[0]()).toBe('current-token');
    expect(connections[0].invoke).toHaveBeenCalledOnceWith('ValidateSubscription');
    expect(service.connected()).toBeTrue();
  });

  it('does not subscribe without a valid organization', async () => {
    ready.set(false); active.set(null);
    service.start(); await settleAsync();
    expect(connections.length).toBe(0);
  });

  it('discards old A callbacks synchronously, stops A, then receives only B', async () => {
    const events: AppNotification[] = [];
    service.notifications$.subscribe(event => events.push(event));
    service.start(); await settleAsync();
    const lateA = connections[0].event!;
    ready.set(false); revision.update(n => n + 1); changes.next();
    lateA(notice());
    expect(events.length).toBe(0);
    expect(connections[0].stop).toHaveBeenCalled();
    active.set(organizationB.id); ready.set(true); changes.next();
    await settleAsync();
    lateA(notice());
    connections[1].event!(notice(organizationB.id));
    expect(events.length).toBe(1);
    expect(urls[1]).toContain(organizationB.id);
  });

  it('rejects malformed and cross-tenant events, retaining explicit nulls', async () => {
    const events: AppNotification[] = [];
    service.notifications$.subscribe(event => events.push(event));
    service.start(); await settleAsync();
    spyOn(console, 'warn');
    connections[0].event!({ organizationId: organizationA.id });
    connections[0].event!(notice(organizationB.id));
    connections[0].event!(notice());
    expect(events.length).toBe(1);
    expect(events[0].relatedEntityId).toBeNull();
    expect(service.error()).toBeTrue();
  });

  it('revalidates on reconnect and suppresses messages until validation completes', async () => {
    const events: AppNotification[] = [];
    service.notifications$.subscribe(event => events.push(event));
    service.start(); await settleAsync();
    const connection = connections[0];
    connection.reconnecting();
    connection.event!(notice());
    expect(events).toEqual([]);
    connection.reconnected(); await settleAsync();
    expect(connection.invoke).toHaveBeenCalledTimes(2);
    connection.event!(notice());
    expect(events.length).toBe(1);
  });

  it('stops a revoked subscription and requests authoritative HTTP membership', async () => {
    service.start(); await settleAsync();
    spyOn(console, 'warn');
    connections[0].invoke.and.rejectWith(new Error('Membership revoked'));
    connections[0].reconnected(); await settleAsync();
    expect(service.connected()).toBeFalse();
    expect(connections[0].stop).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnceWith(organizationA.id);
  });

  it('retries an unavailable transport without overriding centralized context', async () => {
    service.start(); await settleAsync();
    spyOn(console, 'warn');
    connections[0].closed(); await settleAsync();
    expect(service.error()).toBeTrue();
    service.retry(); await settleAsync();
    expect(connections.length).toBe(2);
    expect(service.connected()).toBeTrue();
    expect(service.error()).toBeFalse();
    expect(urls[1]).toContain(organizationA.id);
  });

  it('handles a 401 startup failure through existing session logout', async () => {
    nextStart = () => Promise.reject({ statusCode: 401 });
    spyOn(console, 'warn');
    service.start();
    await settleAsync();
    expect(logout).toHaveBeenCalled();
    expect(service.connected()).toBeFalse();
  });

  it('invalidates a late start when logout/switch occurs during negotiation', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => finish = resolve);
    nextStart = () => pending;
    service.start(); await settleAsync();
    const late = connections[0].event!;
    ready.set(false); revision.update(n => n + 1); changes.next();
    finish(); await settleAsync();
    late(notice());
    expect(service.connected()).toBeFalse();
    expect(connections[0].invoke).not.toHaveBeenCalled();
  });

  it('clears notifications/toasts on A to B and merges live events with the HTTP snapshot', async () => {
    const notifications = TestBed.inject(NotificationService);
    notifications.init(); await settleAsync();
    connections[0].event!(notice());
    response.next({ success: true, data: [] });
    expect(notifications.notifications().length).toBe(1);
    connections[0].event!(notice());
    expect(notifications.toasts().length).toBe(1);
    ready.set(false); revision.update(n => n + 1); changes.next();
    expect(notifications.notifications()).toEqual([]);
    expect(notifications.toasts()).toEqual([]);
    active.set(organizationB.id); ready.set(true); changes.next(); await settleAsync();
    connections[1].event!(notice(organizationB.id));
    expect(notifications.notifications().length).toBe(1);
    notifications.disconnect();
  });

  it('loads Workbench notifications over HTTP without starting another realtime connection', async () => {
    const notifications = TestBed.inject(NotificationService);
    notifications.init(false);
    await settleAsync();
    expect(connections).toEqual([]);
    expect(getNotifications).toHaveBeenCalledTimes(1);
    expect(notifications.loading()).toBeTrue();
    response.next({ success: true, data: [notice()] });
    expect(notifications.notifications().length).toBe(1);
    expect(notifications.loading()).toBeFalse();
    notifications.disconnect();
  });

  it('reloads authoritative HTTP notifications after reconnect without discarding newer live events', async () => {
    const notifications = TestBed.inject(NotificationService);
    notifications.init(); await settleAsync();
    expect(getNotifications).toHaveBeenCalledTimes(2);
    connections[0].event!(notice());
    connections[0].reconnecting();
    connections[0].reconnected(); await settleAsync();
    expect(getNotifications).toHaveBeenCalledTimes(3);
    response.next({ success: true, data: [{ ...notice(), isRead: true }] });
    expect(notifications.notifications().length).toBe(1);
    expect(notifications.notifications()[0].isRead).toBeTrue();
    notifications.disconnect();
  });
});
