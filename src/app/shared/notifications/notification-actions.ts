import { Router } from '@angular/router';
import { AppNotification } from '../../core/models/models';

export function activateNotification(
  notification: AppNotification,
  router: Router,
  canMutate: boolean,
  markRead: (id: string) => void,
  workbench = false
): void {
  if (canMutate) markRead(notification.id);
  if (notification.type === 'share') {
    void router.navigate([workbench ? '/workbench/endpoints' : '/endpoints'], {
      queryParams: { sharedWithMe: '1' }
    });
  }
}
