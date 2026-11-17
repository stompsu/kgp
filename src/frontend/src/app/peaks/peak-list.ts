import { Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { TranslocoPipe } from '@jsverse/transloco';
import { PEAK_COUNT, Peak } from './peak';

export type PeakFilter = 'all' | 'conquered' | 'remaining';

@Component({
  selector: 'app-peak-list',
  imports: [MatButtonModule, MatIconModule, MatListModule, TranslocoPipe],
  template: `
    <div class="head">
      <h2 class="title">{{ 'peaks.listTitle' | transloco }}</h2>
      @if (tracking()) {
        <span class="progress" [attr.aria-label]="'progress.label' | transloco: { count: conquered().size, total: total }">
          {{ 'progress.short' | transloco: { count: conquered().size, total: total } }}
        </span>
      }
    </div>
    <p class="hint">{{ 'peaks.listHint' | transloco }}</p>
    @if (tracking()) {
      <div class="filter" role="group" [attr.aria-label]="'filter.label' | transloco">
        @for (option of filters; track option) {
          <button
            mat-button
            type="button"
            [class.active]="filter() === option"
            [attr.aria-pressed]="filter() === option"
            (click)="filter.set(option)">
            @if (filter() === option) {
              <mat-icon aria-hidden="true">check</mat-icon>
            }
            {{ 'filter.' + option | transloco }}
          </button>
        }
      </div>
    }
    <mat-nav-list>
      @for (peak of visible(); track peak.slug) {
        @let done = conquered().has(peak.slug);
        <a mat-list-item (click)="peakSelected.emit(peak.slug)" (keydown.enter)="peakSelected.emit(peak.slug)" tabindex="0">
          <span matListItemAvatar class="badge" [class.done]="done">{{ peak.number }}</span>
          <span matListItemTitle>
            {{ peak.name }}
            @if (done) {
              <span class="visually-hidden">({{ 'peak.conquered' | transloco }})</span>
            }
          </span>
          <span matListItemLine>{{ peak.range }} · {{ peak.heightMeters }} m</span>
          @if (done) {
            <mat-icon matListItemMeta class="check" aria-hidden="true">check_circle</mat-icon>
          }
        </a>
      } @empty {
        <p class="hint">{{ (filter() === 'conquered' ? 'filter.noneConquered' : 'filter.noneRemaining') | transloco }}</p>
      }
    </mat-nav-list>
  `,
  styles: `
    .head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 16px 16px 0; }
    .title { font: var(--mat-sys-title-large); margin: 0; }
    .progress { font: var(--mat-sys-title-medium); color: var(--mat-sys-primary); }
    .hint { margin: 4px 16px 8px; color: var(--mat-sys-on-surface-variant); }
    .filter {
      display: flex; margin: 0 16px 8px; width: fit-content;
      border: 1px solid var(--mat-sys-outline); border-radius: 20px; overflow: hidden;
    }
    .filter button { border-radius: 0; }
    .filter button + button { border-left: 1px solid var(--mat-sys-outline); }
    .filter button.active { background: var(--mat-sys-secondary-container); color: var(--mat-sys-on-secondary-container); }
    .badge {
      display: grid; place-items: center;
      background: var(--mat-sys-primary-container); color: var(--mat-sys-on-primary-container);
      font: var(--mat-sys-label-large);
    }
    .badge.done {
      border-radius: 6px;
      background: var(--mat-sys-primary); color: var(--mat-sys-on-primary);
      outline: 2px solid var(--mat-sys-primary); outline-offset: 2px;
    }
    .check { color: var(--mat-sys-primary); }
  `,
})
export class PeakListComponent {
  readonly peaks = input.required<Peak[]>();
  /** Slugs of the signed-in user's conquered peaks. */
  readonly conquered = input<ReadonlySet<string>>(new Set());
  /** Show the progress counter and the filter (signed in only). */
  readonly tracking = input(false);
  readonly peakSelected = output<string>();

  protected readonly total = PEAK_COUNT;
  readonly filter = signal<PeakFilter>('all');
  protected readonly filters: PeakFilter[] = ['all', 'conquered', 'remaining'];

  protected readonly visible = computed(() => {
    const filter = this.tracking() ? this.filter() : 'all';
    const conquered = this.conquered();
    if (filter === 'all') return this.peaks();
    return this.peaks().filter((p) => conquered.has(p.slug) === (filter === 'conquered'));
  });
}
