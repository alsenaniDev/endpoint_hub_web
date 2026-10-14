import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UserProfile } from '../../core/models/models';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, LoadingComponent, TranslatePipe],
    templateUrl: './profile.component.html',
    styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
    private api = inject(ApiService);
    private auth = inject(AuthService);

    loading = signal(true);
    profile = signal<UserProfile | null>(null);
    savingProfile = signal(false);
    savingPw = signal(false);

    editUsername = '';
    editFullName = '';
    currentPw = '';
    newPw = '';
    confirmPw = '';

    profileSuccess = '';
    profileError = '';
    pwSuccess = '';
    pwError = '';

    get initial(): string {
        const p = this.profile();
        const name = p?.fullName || p?.username || '?';
        return name.charAt(0).toUpperCase();
    }

    ngOnInit(): void {
        this.api.getProfile().subscribe({
            next: res => {
                if (res.success && res.data) {
                    this.profile.set(res.data);
                    this.editUsername = res.data.username;
                    this.editFullName = res.data.fullName ?? '';
                }
                this.loading.set(false);
            },
            error: () => this.loading.set(false)
        });
    }

    saveProfile(): void {
        this.profileSuccess = '';
        this.profileError = '';
        if (!this.editUsername.trim()) { this.profileError = 'Username is required.'; return; }
        this.savingProfile.set(true);
        this.api.updateProfile({ username: this.editUsername.trim(), fullName: this.editFullName.trim() || undefined }).subscribe({
            next: res => {
                this.savingProfile.set(false);
                if (res.success && res.data) {
                    this.profile.set(res.data);
                    this.profileSuccess = 'Profile updated successfully.';
                    // Update stored auth token display name
                    const current = this.auth.currentUser();
                    if (current) {
                        const updated = { ...current, username: res.data.username };
                        localStorage.setItem('auth', JSON.stringify(updated));
                        this.auth.currentUser.set(updated);
                    }
                } else {
                    this.profileError = res.message ?? 'Failed to update profile.';
                }
            },
            error: () => { this.savingProfile.set(false); this.profileError = 'An error occurred.'; }
        });
    }

    changePassword(): void {
        this.pwSuccess = '';
        this.pwError = '';
        if (!this.currentPw) { this.pwError = 'Current password is required.'; return; }
        if (this.newPw.length < 6) { this.pwError = 'New password must be at least 6 characters.'; return; }
        if (this.newPw !== this.confirmPw) { this.pwError = 'New passwords do not match.'; return; }
        this.savingPw.set(true);
        this.api.changePassword({ currentPassword: this.currentPw, newPassword: this.newPw }).subscribe({
            next: res => {
                this.savingPw.set(false);
                if (res.success) {
                    this.pwSuccess = 'Password changed successfully.';
                    this.currentPw = '';
                    this.newPw = '';
                    this.confirmPw = '';
                } else {
                    this.pwError = res.message ?? 'Failed to change password.';
                }
            },
            error: () => { this.savingPw.set(false); this.pwError = 'An error occurred.'; }
        });
    }
}
