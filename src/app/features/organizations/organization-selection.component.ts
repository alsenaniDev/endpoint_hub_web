import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

@Component({
  selector: 'app-organization-selection',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './organization-selection.component.html',
  styleUrls: ['./organization-selection.component.scss']
})
export class OrganizationSelectionComponent {
  readonly context = inject(OrganizationContextService);
  readonly auth = inject(AuthService);
  readonly account = this.auth.currentUser;
  private readonly router = inject(Router);
  readonly search = signal('');
  readonly selectingId = signal<string | null>(null);
  readonly filteredOrganizations = computed(() => {
    const search = this.search().trim().toLocaleLowerCase();
    return this.context.organizations().filter(organization => !search ||
      `${organization.name} ${organization.type}`.toLocaleLowerCase().includes(search));
  });

  async selectOrganization(id: string): Promise<void> {
    if (this.context.loading() || this.selectingId()) return;
    this.selectingId.set(id);
    try {
      await this.context.selectOrganization(id);
    } finally {
      this.selectingId.set(null);
    }
  }

  async openOrganization(id: string): Promise<void> {
    if (this.context.loading() || this.selectingId()) return;
    this.selectingId.set(id);
    try {
      const selected = await this.context.selectOrganization(id);
      if (selected && this.context.ready()) {
        await this.router.navigateByUrl(this.context.landingPath());
      }
    } finally {
      this.selectingId.set(null);
    }
  }

  async continueToWorkspace(): Promise<void> {
    if (!this.context.ready()) return;
    await this.router.navigateByUrl(this.context.landingPath());
  }

  async reload(): Promise<void> {
    const user = this.account();
    if (user && !this.context.loading()) await this.context.initialize(user.userId, true);
  }

  signOut(): void {
    this.auth.logout();
  }
}
