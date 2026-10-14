import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification } from '../../core/models/models';
import { NotificationService } from '../../core/services/notification.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { activateNotification } from '../../shared/notifications/notification-actions';

type NotificationFilter = { kind: 'all' | 'unread' } | { kind: 'type'; value: string };

@Component({
  selector: 'app-notification-workspace',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './notification-workspace.component.html',
  styleUrls: ['./notification-workspace.component.scss']
})
export class NotificationWorkspaceComponent {
  private readonly service = inject(NotificationService);
  private readonly router = inject(Router);
  readonly notifications = this.service.notifications;
  readonly loading = this.service.loading;
  readonly unreadCount = this.service.unreadCount;
  readonly errorKey = this.service.errorKey;
  readonly realtimeError = this.service.realtimeError;
  readonly canMutate = this.service.canMutate;
  readonly filter = signal<NotificationFilter>({ kind: 'all' });
  readonly search = signal('');
  readonly selectedId = signal<string | null>(null);

  readonly types = computed(() => [...new Set(this.notifications()
    .map(notification => notification.type)
    .filter(type => type.trim().length > 0))]);

  readonly filteredNotifications = computed(() => {
    const filter = this.filter();
    const query = this.search().trim().toLocaleLowerCase();
    return this.notifications().filter(notification => {
      if (filter.kind === 'unread' && notification.isRead) return false;
      if (filter.kind === 'type' && notification.type !== filter.value) return false;
      if (!query) return true;
      return [notification.message, notification.type, notification.relatedEntityId ?? '']
        .some(value => value.toLocaleLowerCase().includes(query));
    });
  });

  readonly selected = computed(() => {
    const visible = this.filteredNotifications();
    return visible.find(notification => notification.id === this.selectedId()) ??
      visible[0] ??
      null;
  });

  setFilter(filter: NotificationFilter): void {
    this.filter.set(filter);
    this.selectedId.set(null);
  }

  isTypeFilter(type: string): boolean {
    const filter = this.filter();
    return filter.kind === 'type' && filter.value === type;
  }

  select(notification: AppNotification): void {
    this.selectedId.set(notification.id);
  }

  isSelected(notification: AppNotification): boolean {
    return this.selected()?.id === notification.id;
  }

  typeLabel(type: string): string {
    return type.replace(/[._-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
  }

  markSelectedRead(): void {
    const notification = this.selected();
    if (notification && !notification.isRead && this.canMutate()) this.service.markRead(notification.id);
  }

  markAllRead(): void {
    if (this.canMutate() && this.unreadCount() > 0) this.service.markAllRead();
  }

  openSelected(): void {
    const notification = this.selected();
    if (notification?.type === 'share') {
      activateNotification(
        notification,
        this.router,
        this.canMutate(),
        id => this.service.markRead(id),
        this.router.url.startsWith('/workbench')
      );
    }
  }

  typeCount(type: string): number {
    return this.notifications().filter(notification => notification.type === type).length;
  }

  trackById(_index: number, notification: AppNotification): string {
    return notification.id;
  }
}
