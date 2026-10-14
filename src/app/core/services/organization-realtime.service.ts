import { inject, Injectable, InjectionToken, OnDestroy, signal } from '@angular/core';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { startWith, Subject, Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AppNotification } from '../models/models';
import { organizationIdPattern } from '../models/organization';
import { AuthService } from './auth.service';
import { OrganizationContextService } from './organization-context.service';

export interface RealtimeConnection {
  start(): Promise<void>;
  stop(): Promise<void>;
  invoke(method: string): Promise<void>;
  on(method: string, handler: (event: unknown) => void): void;
  off(method: string): void;
  onreconnecting(handler: () => void): void;
  onreconnected(handler: () => void): void;
  onclose(handler: () => void): void;
}
export type RealtimeConnectionFactory = (url: string, token: () => string) => RealtimeConnection;
export const REALTIME_CONNECTION_FACTORY = new InjectionToken<RealtimeConnectionFactory>('Organization realtime connection', {
  providedIn: 'root',
  factory: () => (url, token) => new HubConnectionBuilder()
    .withUrl(url, { accessTokenFactory: token })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.None)
    .build()
});

@Injectable({ providedIn: 'root' })
export class OrganizationRealtimeService implements OnDestroy {
  private readonly organization = inject(OrganizationContextService);
  private readonly auth = inject(AuthService);
  private readonly factory = inject(REALTIME_CONNECTION_FACTORY);
  private readonly events = new Subject<AppNotification>();
  private readonly synchronized = new Subject<void>();
  private subscription: Subscription | null = null;
  private connection: RealtimeConnection | null = null;
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  readonly notifications$ = this.events.asObservable();
  readonly synchronized$ = this.synchronized.asObservable();
  readonly connected = signal(false);
  readonly error = signal(false);

  start(): void {
    if (this.subscription) return;
    this.subscription = this.organization.changes$.pipe(startWith(undefined)).subscribe(() => this.rotate());
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    void this.retire();
  }

  retry(): void { if (this.subscription) this.rotate(); }

  private retire(): Promise<void> {
    this.generation++;
    const generation = this.generation;
    this.connected.set(false);
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const old = this.connection;
    this.connection = null;
    old?.off('notification');
    return old ? old.stop().catch(() => {
      if (generation === this.generation) this.error.set(true);
      console.warn('Previous realtime transport could not be stopped; its event handlers are invalidated.');
    }) : Promise.resolve();
  }

  private rotate(): void {
    const stopped = this.retire();
    this.error.set(false);
    const generation = this.generation;
    const revision = this.organization.revision();
    const organizationId = this.organization.activeOrganizationId();
    const current = () => generation === this.generation && revision === this.organization.revision() &&
      organizationId === this.organization.activeOrganizationId() && this.organization.ready();
    this.queue = this.queue.then(() => stopped).then(async () => {
      if (!current() || !organizationId || !this.auth.getToken()) return;
      const url = `${environment.apiUrl.replace(/\/api\/?$/, '')}/hubs/notifications?organizationId=${encodeURIComponent(organizationId)}`;
      const connection = this.factory(url, () => this.auth.getToken() ?? '');
      this.connection = connection;
      connection.on('notification', event => {
        if (!current() || !this.connected()) return;
        if (!isTenantNotification(event) || event.organizationId.toLowerCase() !== organizationId.toLowerCase()) {
          this.error.set(true);
          console.warn('Rejected an invalid or mismatched organization realtime event.');
          return;
        }
        this.events.next(event);
      });
      const validate = async () => {
        try {
          await connection.invoke('ValidateSubscription');
          if (current()) {
            const resumed = !this.connected();
            this.connected.set(true);
            if (resumed) this.synchronized.next();
          }
        } catch (error) {
          if (current()) this.fail(error, organizationId);
        }
      };
      connection.onreconnecting(() => { if (current()) this.connected.set(false); });
      connection.onreconnected(() => { if (current()) void validate(); });
      connection.onclose(() => {
        if (current()) this.fail(new Error('Realtime connection closed.'), organizationId);
      });
      await connection.start();
      if (!current()) return;
      await validate();
      if (current() && this.connected())
        this.heartbeat = setInterval(() => { if (current()) void validate(); }, 30000);
    }).catch(error => {
      if (current() && organizationId) this.fail(error, organizationId);
    });
  }

  private fail(error: unknown, organizationId: string): void {
    this.error.set(true);
    console.warn('Organization realtime unavailable; scoped HTTP membership and notifications remain authoritative.');
    void this.retire();
    if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 401)
      this.auth.logout();
    else void this.organization.revalidate(organizationId);
  }

  ngOnDestroy(): void { this.stop(); }
}

function isTenantNotification(value: unknown): value is AppNotification & { organizationId: string } {
  return typeof value === 'object' && value !== null &&
    'organizationId' in value && typeof value.organizationId === 'string' && organizationIdPattern.test(value.organizationId) &&
    'id' in value && typeof value.id === 'string' && organizationIdPattern.test(value.id) &&
    'message' in value && typeof value.message === 'string' &&
    'type' in value && typeof value.type === 'string' &&
    'isRead' in value && typeof value.isRead === 'boolean' &&
    'createdAt' in value && typeof value.createdAt === 'string' &&
    (!('relatedEntityId' in value) || value.relatedEntityId === null || typeof value.relatedEntityId === 'string');
}
