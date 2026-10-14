import { Component, OnInit, OnDestroy, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { EnvironmentSyncStatus, SwaggerSourceDto, SyncSchedule, SyncLog } from '../../core/models/models';
import { EndpointListComponent } from '../endpoints/endpoint-list/endpoint-list.component';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { TranslatePipe } from '../../core/pipes/translate.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { OrganizationContextService } from '../../core/services/organization-context.service';
import { apiErrorKey } from '../../core/models/organization';

// ── Quick presets ─────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Every hour', cron: '0 * * * *', desc: 'Runs at the start of every hour' },
  { label: 'Every 6 hours', cron: '0 */6 * * *', desc: 'Runs every 6 hours' },
  { label: 'Daily at 2 AM', cron: '0 2 * * *', desc: 'Every day at 02:00 AM' },
  { label: 'Daily at 6 AM', cron: '0 6 * * *', desc: 'Every day at 06:00 AM' },
  { label: 'Weekly (Monday)', cron: '0 2 * * 1', desc: 'Every Monday at 02:00 AM' },
  { label: 'Custom', cron: '', desc: 'Build your own schedule' },
];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 30, 45];
const INTERVALS_HOUR = [1, 2, 3, 4, 6, 8, 12];
const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

type Frequency = 'hourly' | 'every-n-hours' | 'daily' | 'weekly' | 'monthly';

@Component({
  selector: 'app-swagger-sync',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, DropdownModule, LoadingComponent, TranslatePipe, EndpointListComponent],
  templateUrl: './swagger-sync.component.html',
  styleUrls: ['./swagger-sync.component.scss', './swagger-workspace.scss']
})
export class SwaggerSyncComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  auth = inject(AuthService);
  readonly organization = inject(OrganizationContextService);
  readonly readError = signal<string | null>(null);
  readonly isWorkbench = inject(Router).url.startsWith('/workbench');
  private readonly destroyRef = inject(DestroyRef);
  readonly selectedKey = signal<string | null>(null);
  readonly activeTab = signal<'documentation' | 'endpoints' | 'source' | 'synchronization'>('documentation');
  readonly showSchedule = signal(false);
  readonly sourceSearch = signal('');
  readonly sourceMetadata = signal<SwaggerSourceDto | null>(null);
  readonly sourceError = signal<string | null>(null);
  readonly sourceLoading = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly syncLogs = signal<SyncLog[]>([]);
  readonly logsLoading = signal(false);
  readonly logsError = signal<string | null>(null);
  readonly logsTotal = signal(0);
  private sourceGeneration = 0;
  readonly canRun = computed(() => this.organization.canMutate() && this.auth.hasPermission('swaggersync.run'));
  readonly canSchedule = computed(() => this.organization.canMutate() && this.auth.hasPermission('swaggersync.manageschedule'));
  readonly canReadDocumentation = computed(() => this.auth.hasPermission('endpoints.view'));
  readonly canReadSources = computed(() => this.auth.hasPermission('environments.view'));
  readonly canConfigureSources = computed(() => this.organization.canMutate() &&
    this.auth.hasPermission('environments.view') && this.auth.hasPermission('environments.manage'));
  readonly visibleSources = computed(() => {
    const query = this.sourceSearch().trim().toLowerCase();
    return this.statusList().filter(source => !query ||
      (this.organization.structuralOnly() ? `${source.environmentId} ${source.swaggerSourceId ?? ''}`
        : `${source.systemName} ${source.environmentName}`).toLowerCase().includes(query));
  });
  readonly selectedSource = computed<EnvironmentSyncStatus | null>(() =>
    this.statusList().find(source => this.sourceKey(source) === this.selectedKey()) ?? null);
  readonly documentationScopes = computed(() => {
    const selected = this.selectedSource();
    return selected ? [selected] : [];
  });
  readonly sourceKey = (source: EnvironmentSyncStatus): string =>
    `${source.environmentId}:${source.swaggerSourceId ?? 'legacy'}`;
  readonly trackSource = (_index: number, source: EnvironmentSyncStatus): string => this.sourceKey(source);

  selectSource(source: EnvironmentSyncStatus): void {
    this.selectedKey.set(this.sourceKey(source));
    this.sourceMetadata.set(null);
    this.sourceError.set(null);
    this.sourceLoading.set(false);
    this.syncLogs.set([]);
    this.logsError.set(null);
    this.logsTotal.set(0);
    this.logsLoading.set(false);
    const generation = ++this.sourceGeneration;
    if (this.activeTab() === 'synchronization') this.loadSyncLogs();
    if (!source.swaggerSourceId || !this.canReadSources()) return;
    this.sourceLoading.set(true);
    this.api.getSwaggerSources(source.environmentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        if (generation !== this.sourceGeneration) return;
        if (response.success && response.data) {
          const metadata = response.data.find(item => item.id === source.swaggerSourceId);
          if (metadata) this.sourceMetadata.set(metadata);
          else this.sourceError.set('org.unavailable');
        } else this.sourceError.set('org.requestFailed');
        this.sourceLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (generation !== this.sourceGeneration) return;
        this.sourceError.set(apiErrorKey(error.status));
        this.sourceLoading.set(false);
      }
    });
  }

  openSynchronization(): void {
    this.activeTab.set('synchronization');
    this.loadSyncLogs();
  }

  loadSyncLogs(): void {
    const source = this.selectedSource();
    if (!source || !this.auth.hasPermission('swaggersync.view')) return;
    const generation = this.sourceGeneration;
    this.logsLoading.set(true);
    this.logsError.set(null);
    this.api.getSyncLogs(source.environmentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        if (generation !== this.sourceGeneration) return;
        if (response.success && response.data) {
          this.syncLogs.set(response.data.items);
          this.logsTotal.set(response.data.totalCount);
        } else this.logsError.set('org.requestFailed');
        this.logsLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        if (generation !== this.sourceGeneration) return;
        this.logsError.set(apiErrorKey(error.status));
        this.logsLoading.set(false);
      }
    });
  }

  presets = PRESETS;

  // Schedule state
  scheduleEnabled = false;
  selectedPreset = 'Daily at 2 AM';
  cronExpression = '0 2 * * *';
  cronLabel = 'Every day at 02:00';
  savingSchedule = signal(false);
  scheduleSaved = signal(false);
  scheduleError = signal<string | null>(null);

  // Custom builder state
  frequency: Frequency = 'daily';
  customHour = 2;
  customMinute = 0;
  customWeekday = 1;       // Monday
  customMonthDay = 1;
  customIntervalH = 6;

  // Data arrays for template
  weekdays = WEEKDAYS;
  hours = HOURS;
  hourOptions = HOURS.map(h => ({ label: String(h).padStart(2, '0') + ':00', value: h }));
  monthDayOptions = MONTH_DAYS.map(d => ({ label: String(d), value: d }));
  minutes = MINUTES;
  intervalHours = INTERVALS_HOUR;
  monthDays = MONTH_DAYS;

  // Status state
  statusList = signal<EnvironmentSyncStatus[]>([]);
  loadingStatus = signal(true);
  running = signal(false);
  syncingEnvId = signal<string | null>(null);

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (this.auth.hasPermission('swaggersync.manageschedule')) this.loadSchedule();
    this.loadStatus();
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  loadSchedule(): void {
    this.api.getSyncSchedule().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: res => {
      if (!res.success || !res.data) { this.scheduleError.set('org.requestFailed'); return; }
      this.scheduleEnabled = res.data.isEnabled;
      this.cronExpression = res.data.cronExpression;
      this.cronLabel = res.data.label;
      const preset = PRESETS.find(p => p.cron === res.data!.cronExpression);
      this.selectedPreset = preset?.label ?? 'Custom';
      if (!preset) this.parseCronIntoBuilder(res.data.cronExpression);
    }, error: (error: HttpErrorResponse) => this.scheduleError.set(apiErrorKey(error.status)) });
  }

  loadStatus(): void {
    this.readError.set(null);
    this.loadingStatus.set(true);
    this.api.getAllSyncStatus().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        if (res.success && res.data) {
          this.statusList.set(res.data);
          if (this.isWorkbench && !this.selectedSource()) {
            this.selectedKey.set(null);
            this.sourceMetadata.set(null);
            ++this.sourceGeneration;
            this.sourceLoading.set(false);
            if (res.data.length) this.selectSource(res.data[0]);
          }
        }
        else this.readError.set('org.requestFailed');
        this.loadingStatus.set(false);
      },
      error: (error: HttpErrorResponse) => { this.readError.set(apiErrorKey(error.status)); this.loadingStatus.set(false); }
    });
  }

  onEnabledToggle(): void { this.saveSchedule(); }

  selectPreset(p: typeof PRESETS[0]): void {
    this.selectedPreset = p.label;
    if (p.cron) {
      this.cronExpression = p.cron;
      this.cronLabel = p.desc;
    } else {
      // Entering Custom — build from current builder state
      this.buildCron();
    }
  }

  setFrequency(f: Frequency): void {
    this.frequency = f;
    this.buildCron();
  }

  buildCron(): void {
    const h = this.customHour;
    const m = this.customMinute;
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(h)}:${pad(m)}`;

    switch (this.frequency) {
      case 'hourly':
        this.cronExpression = '0 * * * *';
        this.cronLabel = 'Every hour';
        break;
      case 'every-n-hours':
        this.cronExpression = `0 */${this.customIntervalH} * * *`;
        this.cronLabel = `Every ${this.customIntervalH} hours`;
        break;
      case 'daily':
        this.cronExpression = `${m} ${h} * * *`;
        this.cronLabel = `Every day at ${timeStr}`;
        break;
      case 'weekly': {
        const day = WEEKDAYS[this.customWeekday];
        this.cronExpression = `${m} ${h} * * ${this.customWeekday}`;
        this.cronLabel = `Every ${day} at ${timeStr}`;
        break;
      }
      case 'monthly':
        this.cronExpression = `${m} ${h} ${this.customMonthDay} * *`;
        this.cronLabel = `Every month on day ${this.customMonthDay} at ${timeStr}`;
        break;
    }
  }

  /** Try to reverse-map a stored cron into builder controls (best-effort). */
  private parseCronIntoBuilder(cron: string): void {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return;
    const [min, hour, dom, , dow] = parts;

    if (hour === '*' && min === '0') { this.frequency = 'hourly'; }
    else if (hour.startsWith('*/')) { this.frequency = 'every-n-hours'; this.customIntervalH = parseInt(hour.slice(2)) || 6; }
    else if (dom !== '*') { this.frequency = 'monthly'; this.customMonthDay = parseInt(dom) || 1; this.customHour = parseInt(hour) || 0; this.customMinute = parseInt(min) || 0; }
    else if (dow !== '*') { this.frequency = 'weekly'; this.customWeekday = parseInt(dow) || 1; this.customHour = parseInt(hour) || 0; this.customMinute = parseInt(min) || 0; }
    else { this.frequency = 'daily'; this.customHour = parseInt(hour) || 0; this.customMinute = parseInt(min) || 0; }
  }

  saveSchedule(): void {
    if (!this.organization.requireMutation('swaggersync.manageschedule')) return;
    this.savingSchedule.set(true);
    this.scheduleSaved.set(false);
    this.scheduleError.set(null);

    const payload: SyncSchedule = {
      isEnabled: this.scheduleEnabled,
      cronExpression: this.cronExpression,
      label: this.cronLabel
    };

    this.api.updateSyncSchedule(payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.savingSchedule.set(false);
        if (res.success) {
          this.scheduleSaved.set(true);
          setTimeout(() => this.scheduleSaved.set(false), 3000);
        } else {
          this.scheduleError.set(res.message ?? 'Failed to save schedule.');
        }
      },
      error: (error: HttpErrorResponse) => { this.savingSchedule.set(false); this.scheduleError.set(apiErrorKey(error.status)); }
    });
  }

  runNow(): void {
    if (!this.organization.requireMutation('swaggersync.run')) return;
    this.running.set(true);
    this.actionError.set(null);
    this.api.triggerAllSync().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        if (!response.success) { this.running.set(false); this.actionError.set('org.requestFailed'); return; }
        if (this.pollTimer) clearInterval(this.pollTimer);
        let polls = 0;
        this.pollTimer = setInterval(() => {
          this.loadStatus();
          polls++;
          if (polls >= 10) { clearInterval(this.pollTimer!); this.pollTimer = null; this.running.set(false); }
        }, 3000);
      },
      error: (error: HttpErrorResponse) => { this.running.set(false); this.actionError.set(apiErrorKey(error.status)); }
    });
  }

  syncEnv(s: EnvironmentSyncStatus): void {
    if (!this.organization.requireMutation('swaggersync.run')) return;
    this.syncingEnvId.set(s.environmentId);
    this.actionError.set(null);
    this.api.syncSwagger(s.environmentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: response => {
        this.syncingEnvId.set(null);
        if (response.success) this.loadStatus();
        else this.actionError.set('org.requestFailed');
      },
      error: (error: HttpErrorResponse) => { this.syncingEnvId.set(null); this.actionError.set(apiErrorKey(error.status)); }
    });
  }
}
