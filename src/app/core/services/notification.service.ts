import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { catchError, EMPTY, finalize, merge, startWith, Subscription, switchMap, tap } from 'rxjs';
import { ApiService } from './api.service';
import { OrganizationContextService } from './organization-context.service';
import { OrganizationRealtimeService } from './organization-realtime.service';
import { AppNotification } from '../models/models';
import { apiErrorKey } from '../models/organization';

export interface NotifToast { id: string; message: string; }

@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly organization = inject(OrganizationContextService);
  private readonly realtime = inject(OrganizationRealtimeService);
  private events: Subscription | null = null;
  private subscription: Subscription | null = null;
  private realtimeEnabled = false;
  notifications = signal<AppNotification[]>([]);
  loading = signal(false);
  unreadCount = computed(() => this.notifications().filter(n => !n.isRead).length);
  toasts = signal<NotifToast[]>([]);
  error = signal(false);
  errorKey = signal<string | null>(null);
  readonly canMutate = this.organization.canMutate;
  private fail(error?: { status?: number }): void {
    this.error.set(true);
    this.errorKey.set(apiErrorKey(error?.status ?? 500));
  }
  readonly realtimeError = this.realtime.error;

  init(enableRealtime = true): void {
    if (this.subscription) {
      if (!enableRealtime || this.realtimeEnabled) return;
      this.disconnect();
    }
    this.realtimeEnabled = enableRealtime;
    if (enableRealtime) {
      this.events = this.realtime.notifications$.subscribe(notification => {
        if (this.notifications().some(n => n.id === notification.id)) return;
        this.notifications.update(list => [notification, ...list].slice(0, 30));
        this.toasts.update(list => [{ id: notification.id, message: notification.message }, ...list].slice(0, 5));
      });
    }
    const organizationChanges = this.organization.changes$.pipe(
      startWith(undefined),
      tap(() => {
        this.notifications.set([]);
        this.toasts.set([]);
        this.error.set(false);
        this.errorKey.set(null);
        this.loading.set(false);
      })
    );
    const refreshes = enableRealtime
      ? merge(organizationChanges, this.realtime.synchronized$)
      : organizationChanges;
    this.subscription = refreshes.pipe(
      switchMap(() => {
        if (!this.organization.ready()) {
          this.loading.set(false);
          return EMPTY;
        }
        this.loading.set(true);
        return this.api.getNotifications().pipe(
          catchError(error => { this.fail(error); return EMPTY; }),
          finalize(() => this.loading.set(false))
        );
      })
    ).subscribe(result => {
      if (result.success && result.data) {
        this.error.set(false);
        this.errorKey.set(null);
        this.loading.set(false);
        const existing = this.notifications();
        const snapshot = result.data;
        this.notifications.set([...snapshot, ...existing.filter(n => !snapshot.some(e => e.id === n.id))]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30));
      }
      else { this.fail(); this.organization.reportApiError(500); }
    });
    if (enableRealtime) this.realtime.start();
  }

  dismissToast(id: string): void { this.toasts.update(t => t.filter(item => item.id !== id)); }
  retryRealtime(): void { this.realtime.retry(); }

  markAllRead(): void {
    if (!this.canMutate()) return;
    this.api.markAllNotificationsRead().subscribe({
      next: result => {
        if (result.success) this.notifications.update(list => list.map(n => ({ ...n, isRead: true })));
        else { this.fail(); this.organization.reportApiError(500); }
      },
      error: error => this.fail(error)
    });
  }

  markRead(id: string): void {
    if (!this.canMutate()) return;
    if (this.notifications().find(n => n.id === id)?.isRead) return;
    this.api.markNotificationRead(id).subscribe({
      next: result => {
        if (result.success) this.notifications.update(list => list.map(n => n.id === id ? { ...n, isRead: true } : n));
        else { this.fail(); this.organization.reportApiError(500); }
      },
      error: error => this.fail(error)
    });
  }

  disconnect(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.events?.unsubscribe();
    this.events = null;
    this.realtime.stop();
    this.realtimeEnabled = false;
    this.notifications.set([]);
    this.toasts.set([]);
    this.error.set(false);
    this.errorKey.set(null);
    this.loading.set(false);
  }

  ngOnDestroy(): void { this.disconnect(); }
}
