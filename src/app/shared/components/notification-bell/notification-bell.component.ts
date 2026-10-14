import { Component, signal, computed, HostListener, inject } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService, NotifToast } from '../../../core/services/notification.service';
import { AppNotification } from '../../../core/models/models';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { activateNotification } from '../../notifications/notification-actions';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, NgIf, NgFor, TranslatePipe],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.scss']
})
export class NotificationBellComponent {
  private notifService = inject(NotificationService);
  private router = inject(Router);

  notifications = this.notifService.notifications;
  unreadCount = this.notifService.unreadCount;
  toasts = this.notifService.toasts;
  realtimeError = this.notifService.realtimeError;
  errorKey = this.notifService.errorKey;
  canMutate = this.notifService.canMutate;
  open = signal(false);

  recent = computed(() => this.notifications().slice(0, 20));

  toggle(): void {
    this.open.update(v => !v);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (!target.closest('.notif-bell-wrap')) {
      this.open.set(false);
    }
  }

  markAll(): void {
    if (!this.canMutate()) return;
    this.notifService.markAllRead();
  }

  retryRealtime(): void { this.notifService.retryRealtime(); }

  clickNotif(n: AppNotification): void {
    activateNotification(n, this.router, this.canMutate(), id => this.notifService.markRead(id));
    this.open.set(false);
  }

  dismissToast(t: NotifToast): void {
    this.notifService.dismissToast(t.id);
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
}
