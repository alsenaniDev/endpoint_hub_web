import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationService } from '../../../core/services/notification.service';
import { TranslateService } from '../../../core/services/translate.service';

describe('NotificationBellComponent panel positioning', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  const originalDir = document.documentElement.dir;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        provideRouter([]),
        {
          provide: NotificationService,
          useValue: {
            notifications: signal([]),
            unreadCount: signal(0),
            toasts: signal([]),
            realtimeError: signal(null),
            errorKey: signal(null),
            canMutate: signal(false),
            markAllRead: jasmine.createSpy('markAllRead'),
            retryRealtime: jasmine.createSpy('retryRealtime'),
            dismissToast: jasmine.createSpy('dismissToast'),
            markRead: jasmine.createSpy('markRead')
          }
        },
        {
          provide: TranslateService,
          useValue: { t: (key: string) => key, translations$: of({}) }
        }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    document.documentElement.dir = originalDir;
  });

  for (const direction of ['ltr', 'rtl'] as const) {
    it(`keeps the panel attached to the ${direction.toUpperCase()} bell and inside the viewport`, async () => {
      document.documentElement.dir = direction;
      const wrapper = fixture.nativeElement.querySelector('.notif-bell-wrap') as HTMLElement;
      Object.assign(wrapper.style, {
        position: 'fixed',
        top: '20px',
        width: '38px',
        left: direction === 'rtl' ? '16px' : 'auto',
        right: direction === 'ltr' ? '16px' : 'auto'
      });

      const bell = fixture.nativeElement.querySelector('.notif-btn') as HTMLButtonElement;
      bell.click();
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 220));

      const panel = fixture.nativeElement.querySelector('.notif-panel') as HTMLElement;
      expect(panel).toBeTruthy();
      const panelRect = panel.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      expect(getComputedStyle(panel).insetInlineEnd).toBe('0px');
      expect(panelRect.left).toBeGreaterThanOrEqual(0);
      expect(panelRect.right).toBeLessThanOrEqual(document.documentElement.clientWidth);
      if (direction === 'ltr') {
        expect(Math.abs(panelRect.right - wrapperRect.right)).toBeLessThanOrEqual(1);
      } else {
        expect(Math.abs(panelRect.left - wrapperRect.left)).toBeLessThanOrEqual(1);
      }

      bell.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.notif-panel')).toBeNull();
      bell.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.notif-panel')).toBeTruthy();
    });
  }
});
