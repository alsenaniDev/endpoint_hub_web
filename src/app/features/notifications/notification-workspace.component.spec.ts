import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AppNotification } from '../../core/models/models';
import { NotificationService } from '../../core/services/notification.service';
import { TranslateService } from '../../core/services/translate.service';
import { NotificationWorkspaceComponent } from './notification-workspace.component';

describe('NotificationWorkspaceComponent', () => {
  let fixture: ComponentFixture<NotificationWorkspaceComponent>;
  let notifications: ReturnType<typeof signal<AppNotification[]>>;
  let loading: ReturnType<typeof signal<boolean>>;
  let errorKey: ReturnType<typeof signal<string | null>>;
  let canMutate: ReturnType<typeof signal<boolean>>;
  let markRead: jasmine.Spy;
  let markAllRead: jasmine.Spy;
  const share: AppNotification = {
    id: 'notification-share',
    message: 'A shared endpoint was added to your collection.',
    type: 'share',
    isRead: false,
    createdAt: '2026-10-04T10:00:00Z',
    relatedEntityId: 'endpoint-a'
  };
  const endpoint: AppNotification = {
    id: 'notification-endpoint',
    message: 'Endpoint documentation was updated.',
    type: 'endpoint',
    isRead: true,
    createdAt: '2026-10-03T10:00:00Z'
  };
  const messages: Record<string, string> = {
    'notifications.title': 'Notifications',
    'notifications.unread': 'Unread',
    'notifications.realtimeUnavailable': 'Live updates are unavailable. Stored notifications remain available.',
    'notifications.emptyTitle': 'No notifications yet',
    'notifications.noMatches': 'No matching notifications',
    'notifications.permissionReadOnly': 'Read state cannot be changed with this membership.',
    'notifications.openShared': 'Open shared endpoints'
  };

  beforeEach(async () => {
    notifications = signal([share, endpoint]);
    loading = signal(false);
    errorKey = signal<string | null>(null);
    canMutate = signal(true);
    markRead = jasmine.createSpy('markRead');
    markAllRead = jasmine.createSpy('markAllRead');
    const service = {
      notifications,
      loading,
      unreadCount: computed(() => notifications().filter(item => !item.isRead).length),
      errorKey,
      realtimeError: signal(false),
      canMutate,
      markRead,
      markAllRead,
      retryRealtime: jasmine.createSpy('retryRealtime'),
      dismissToast: jasmine.createSpy('dismissToast')
    };
    await TestBed.configureTestingModule({
      imports: [NotificationWorkspaceComponent],
      providers: [
        provideRouter([{ path: 'workbench/notifications', component: NotificationWorkspaceComponent }]),
        { provide: NotificationService, useValue: service },
        { provide: TranslateService, useValue: { translations$: of({}), t: (key: string) => messages[key] ?? key } }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationWorkspaceComponent);
    fixture.detectChanges();
  });

  it('shows real notification fields, unread state and details without preference controls', () => {
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.notification-row').length).toBe(2);
    expect(root.textContent).toContain(share.message);
    expect(root.textContent).toContain('Share');
    expect(root.textContent).toContain('Unread');
    expect(root.textContent).toContain('endpoint-a');
    expect(root.textContent).not.toContain('Notification preferences');
    expect(root.textContent).not.toContain('severity');
  });

  it('filters by unread, actual notification types and search text', () => {
    const c = fixture.componentInstance;
    c.setFilter({ kind: 'unread' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.notification-row').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain(share.message);

    c.setFilter({ kind: 'type', value: 'endpoint' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.notification-row').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain(endpoint.message);

    c.search.set('no match');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.notification-row').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('No matching notifications');
  });

  it('selects details and exposes only the existing share action', () => {
    const c = fixture.componentInstance;
    c.select(endpoint);
    fixture.detectChanges();
    expect(c.selected()?.id).toBe(endpoint.id);
    expect(fixture.nativeElement.querySelector('.primary-action')).toBeNull();

    c.select(share);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.primary-action').textContent).toContain('Open shared endpoints');
  });

  it('uses existing read callbacks and preserves the read-only restriction', () => {
    const c = fixture.componentInstance;
    canMutate.set(false);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.mark-all-button') as HTMLButtonElement).disabled).toBeTrue();
    c.markAllRead();
    c.markSelectedRead();
    expect(markAllRead).not.toHaveBeenCalled();
    expect(markRead).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Read state cannot be changed');

    canMutate.set(true);
    c.markAllRead();
    c.markSelectedRead();
    expect(markAllRead).toHaveBeenCalledTimes(1);
    expect(markRead).toHaveBeenCalledOnceWith(share.id);
  });

  it('renders loading, translated request error, empty and realtime warning states distinctly', () => {
    loading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notification-skeleton')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('No notifications yet');

    loading.set(false);
    errorKey.set('org.forbidden');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('org.forbidden');

    errorKey.set(null);
    notifications.set([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No notifications yet');

    TestBed.inject(NotificationService).realtimeError.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Live updates are unavailable');
  });

  it('uses the existing share activation route and marks read through the shared action', async () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    const c = fixture.componentInstance;
    c.select(share);
    c.openSelected();
    expect(markRead).toHaveBeenCalledOnceWith(share.id);
    expect(router.navigate).toHaveBeenCalledOnceWith(
      ['/endpoints'],
      { queryParams: { sharedWithMe: '1' } }
    );

    canMutate.set(false);
    c.openSelected();
    expect(markRead).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledTimes(2);
  });

  it('opens shared endpoints under the Workbench route when activated from Workbench Notifications', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/workbench/notifications');
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture.componentInstance.select(share);
    fixture.componentInstance.openSelected();

    expect(router.navigate).toHaveBeenCalledOnceWith(
      ['/workbench/endpoints'],
      { queryParams: { sharedWithMe: '1' } }
    );
    expect(markRead).toHaveBeenCalledOnceWith(share.id);
  });
});
