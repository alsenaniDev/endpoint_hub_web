import { Directive, effect, inject, Input, signal, TemplateRef, ViewContainerRef } from '@angular/core';
import { OrganizationContextService } from '../services/organization-context.service';

@Directive({ selector: '[appPermission]', standalone: true })
export class PermissionDirective {
  private readonly context = inject(OrganizationContextService);
  private readonly template = inject(TemplateRef<unknown>);
  private readonly container = inject(ViewContainerRef);
  private readonly key = signal('');
  private visible = false;

  @Input() set appPermission(value: string) { this.key.set(value); }

  constructor() {
    effect(() => {
      const visible = this.context.hasPermission(this.key());
      if (visible === this.visible) return;
      this.visible = visible;
      this.container.clear();
      if (visible) this.container.createEmbeddedView(this.template);
    });
  }
}
