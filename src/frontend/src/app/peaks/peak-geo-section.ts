import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ParkingFeature, PeakGeoService, TrailFeature, formatKm, trailColour } from './peak-geo';

/** Same threshold as the peaks list: explain that the serverless API/DB are waking up. */
const WAKING_HINT_AFTER_MS = 4000;

/** "Szlaki" and "Parkingi" of a peak, from OpenStreetMap via our API, with the ODbL attribution. */
@Component({
  selector: 'app-peak-geo',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, TranslocoPipe],
  template: `
    @if (geo.slug() === slug()) {
      <section class="trails" aria-labelledby="geo-trails-title">
        <h3 id="geo-trails-title">{{ 'geo.trailsTitle' | transloco }}</h3>
        @if (geo.trails.isLoading()) {
          <mat-progress-bar mode="indeterminate" />
          <p class="note" role="status">{{ (waking() ? 'peaks.waking' : 'geo.trailsLoading') | transloco }}</p>
        } @else if (geo.trails.error()) {
          <div class="note" role="alert">
            <p>{{ 'geo.trailsError' | transloco }}</p>
            <button mat-stroked-button (click)="geo.trails.reload()">{{ 'peaks.retry' | transloco }}</button>
          </div>
        } @else if (trails().length === 0) {
          <p class="note empty">{{ 'geo.noTrails' | transloco }}</p>
        } @else {
          <ul class="items">
            @for (trail of trails(); track trail.properties.osmId) {
              @let t = trail.properties;
              <li>
                <span class="swatch" [class.unknown]="!t.colour" [style.background]="colourOf(trail)" aria-hidden="true"></span>
                <div class="text">
                  <span class="title">{{ t.name ?? ('geo.unnamedTrail' | transloco) }}</span>
                  <span class="meta">
                    {{ 'geo.colourLabel' | transloco: { colour: ('geo.colour.' + (t.colour ?? 'unknown') | transloco) } }}
                    @if (t.ref) { · {{ 'geo.ref' | transloco: { ref: t.ref } }} }
                    @if (t.network) { · {{ 'geo.network.' + t.network | transloco }} }
                  </span>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <section class="parking" aria-labelledby="geo-parking-title">
        <h3 id="geo-parking-title">{{ 'geo.parkingTitle' | transloco }}</h3>
        @if (geo.parking.isLoading()) {
          <mat-progress-bar mode="indeterminate" />
          <p class="note" role="status">{{ (waking() ? 'peaks.waking' : 'geo.parkingLoading') | transloco }}</p>
        } @else if (geo.parking.error()) {
          <div class="note" role="alert">
            <p>{{ 'geo.parkingError' | transloco }}</p>
            <button mat-stroked-button (click)="geo.parking.reload()">{{ 'peaks.retry' | transloco }}</button>
          </div>
        } @else if (parking().length === 0) {
          <p class="note empty">{{ 'geo.noParking' | transloco }}</p>
        } @else {
          <ul class="items">
            @for (place of parking(); track place.properties.osmId) {
              @let p = place.properties;
              @let name = p.name ?? ('geo.unnamedParking' | transloco);
              <li>
                <span class="sign" aria-hidden="true">P</span>
                <div class="text">
                  <span class="title">{{ name }}</span>
                  <span class="meta">
                    {{ 'geo.distance' | transloco: { km: km(p.distanceMeters) } }} ·
                    {{ 'geo.fee.' + (p.fee === null ? 'unknown' : p.fee ? 'paid' : 'free') | transloco }}
                    @if (p.capacity !== null) { · {{ 'geo.capacity' | transloco: { count: p.capacity } }} }
                  </span>
                  <span class="links">
                    <a [href]="directionsUrl(place)" target="_blank" rel="noopener"
                       [attr.aria-label]="'geo.navigateTo' | transloco: { name }">{{ 'geo.navigate' | transloco }}</a>
                    <a [href]="'https://www.openstreetmap.org/' + p.osmId" target="_blank" rel="noopener"
                       [attr.aria-label]="'geo.osmObjectOf' | transloco: { name }">{{ 'geo.osmObject' | transloco }}</a>
                  </span>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <p class="attribution">
        {{ 'geo.dataPrefix' | transloco }}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">{{ 'geo.osmContributors' | transloco }}</a>,
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">{{ 'geo.odbl' | transloco }}</a>
      </p>
    }
  `,
  styles: `
    :host { display: block; }
    h3 { font: var(--mat-sys-title-small); margin: 16px 0 4px; }
    .note { color: var(--mat-sys-on-surface-variant); }
    .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { display: flex; gap: 10px; align-items: flex-start; }
    .text { display: grid; gap: 2px; }
    .title { font: var(--mat-sys-body-large); }
    .meta { font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface-variant); }
    .links { display: flex; gap: 16px; }
    .swatch { flex: none; width: 24px; height: 8px; margin-top: 8px; border: 2px solid #fff; outline: 1px solid var(--mat-sys-outline); }
    .swatch.unknown { background: repeating-linear-gradient(90deg, #7b1fa2 0 6px, #fff 6px 10px) !important; }
    .sign { flex: none; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 4px; background: #1565c0; color: #fff; font-weight: 700; }
    .attribution { margin-top: 16px; font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface-variant); }
  `,
})
export class PeakGeoSectionComponent {
  /** Slug of the peak being shown; the section stays empty until the service has it selected. */
  readonly slug = input.required<string>();
  protected readonly geo = inject(PeakGeoService);
  private readonly lang = toSignal(inject(TranslocoService).langChanges$, { initialValue: 'pl' });

  protected readonly trails = this.geo.trailFeatures;
  protected readonly parking = this.geo.parkingFeatures;
  protected readonly waking = signal(false);
  private readonly loading = computed(() => this.geo.trails.isLoading() || this.geo.parking.isLoading());

  constructor() {
    effect((onCleanup) => {
      if (!this.loading()) {
        this.waking.set(false);
        return;
      }
      const timer = setTimeout(() => this.waking.set(true), WAKING_HINT_AFTER_MS);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected colourOf(trail: TrailFeature): string {
    return trailColour(trail.properties.colour);
  }

  protected km(meters: number): string {
    return formatKm(meters, this.lang());
  }

  protected directionsUrl(place: ParkingFeature): string {
    const [lon, lat] = place.geometry.coordinates;
    return `https://www.openstreetmap.org/directions?to=${lat},${lon}`;
  }
}
