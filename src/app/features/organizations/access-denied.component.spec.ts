import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AccessDeniedComponent } from './access-denied.component';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { TranslateService } from '../../core/services/translate.service';

describe('AccessDeniedComponent', () => {
  let fixture: ComponentFixture<AccessDeniedComponent>;
  const ready = signal(true);
  const deniedFrom = signal<string | null>(null);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccessDeniedComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: (key: string) => key === 'from' ? deniedFrom() : null } } }
        },
        {
          provide: OrganizationContextService,
          useValue: {
            ready,
            structuralOnly: signal(false),
            activeOrganizationId: signal('org-a'),
            activeOrganization: signal({ id: 'org-a', name: 'Active organization' }),
            canMutate: signal(false),
            hasPermission: (permission: string) => permission === 'teams.view'
          }
        },
        {
          provide: TranslateService,
          useValue: {
            t: (key: string) => ({
              'accessDenied.title': 'Access restricted',
              'accessDenied.permission': 'Active membership confirmed, but this resource is not authorized.',
              'accessDenied.context': 'An active organization membership or context is unavailable.',
              'accessDenied.organization': 'Active organization',
              'accessDenied.return': 'Organization settings',
              'workbench.brandLabel': 'Endpoints Hub workbench'
            }[key] ?? key),
            translations$: of({})
          }
        }
      ]
    }).compileComponents();
    ready.set(true);
    deniedFrom.set(null);
    fixture = TestBed.createComponent(AccessDeniedComponent);
    fixture.detectChanges();
  });

  it('identifies an authenticated membership with insufficient resource access', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.access-denied-page')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent).toContain(
      'Active membership confirmed, but this resource is not authorized.'
    );
    expect(element.textContent).toContain('Active organization');
    expect(element.querySelector('.workbench-sidebar')).toBeNull();
  });

  it('uses a generic context-unavailable message when no active organization is ready', () => {
    ready.set(false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain(
      'An active organization membership or context is unavailable.'
    );
  });

  it('returns Workbench-origin denials to an authorized Workbench destination', () => {
    deniedFrom.set('workbench');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.organization-link')?.getAttribute('href'))
      .toBe('/workbench/teams');
  });

  it('keeps the legacy fallback when no organization context or Workbench destination is available', () => {
    deniedFrom.set('workbench');
    ready.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.organization-link')?.getAttribute('href'))
      .toBe('/organizations');

    ready.set(true);
    deniedFrom.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.organization-link')?.getAttribute('href'))
      .toBe('/organizations');
  });
});
