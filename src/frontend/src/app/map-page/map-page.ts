import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe } from '@jsverse/transloco';
import { MapComponent } from '../map/map';
import { PeakListComponent } from '../peaks/peak-list';
import { PeakDetailsComponent } from '../peaks/peak-details';
import { PeaksService } from '../peaks/peak';

/** After this long, explain that the serverless API/DB are waking up rather than looking stuck. */
const WAKING_HINT_AFTER_MS = 4000;

@Component({
  selector: 'app-map-page',
  imports: [MapComponent, PeakListComponent, PeakDetailsComponent, MatButtonModule, MatProgressBarModule, TranslocoPipe],
  template: `
    <section class="map">
      <app-map
        [peaks]="list()"
        [selectedSlug]="slug() ?? null"
        [label]="'map.label' | transloco"
        (peakSelected)="select($event)" />
    </section>

    <aside class="panel" [class.has-selection]="!!slug()">
      @if (peaks.isLoading()) {
        <mat-progress-bar mode="indeterminate" />
        <p class="status" role="status">{{ (waking() ? 'peaks.waking' : 'peaks.loading') | transloco }}</p>
      } @else if (peaks.error()) {
        <div class="status" role="alert">
          <p>{{ 'peaks.error' | transloco }}</p>
          <button mat-flat-button (click)="peaks.reload()">{{ 'peaks.retry' | transloco }}</button>
        </div>
      } @else if (slug()) {
        @if (selected(); as peak) {
          <app-peak-details [peak]="peak" (closed)="select(null)" />
        } @else {
          <p class="status" role="alert">{{ 'peaks.notFound' | transloco }}</p>
        }
      } @else {
        <app-peak-list [peaks]="list()" (peakSelected)="select($event)" />
      }
    </aside>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr 380px;
      height: 100%;
      min-height: 0;
    }
    .map { min-height: 0; }
    .panel {
      overflow-y: auto;
      border-left: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container-low);
    }
    .status { padding: 16px; }

    @media (max-width: 767px) {
      :host { grid-template-columns: 1fr; grid-template-rows: 1fr 45%; }
      .panel { border-left: 0; border-top: 1px solid var(--mat-sys-outline-variant); }
      .panel.has-selection { grid-row: 2; }
    }
  `,
})
export class MapPage {
  /** Bound from the route `peaks/:slug`. */
  readonly slug = input<string>();

  protected readonly peaks = inject(PeaksService).peaks;
  private readonly router = inject(Router);

  /** Safe read: `resource.value()` throws while the resource is in an error state. */
  protected readonly list = computed(() => (this.peaks.hasValue() ? this.peaks.value() : []));
  protected readonly selected = computed(() => this.list().find((p) => p.slug === this.slug()));
  protected readonly waking = signal(false);

  constructor() {
    effect((onCleanup) => {
      if (!this.peaks.isLoading()) {
        this.waking.set(false);
        return;
      }
      const timer = setTimeout(() => this.waking.set(true), WAKING_HINT_AFTER_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected select(slug: string | null): void {
    void this.router.navigate(slug ? ['/peaks', slug] : ['/']);
  }
}
