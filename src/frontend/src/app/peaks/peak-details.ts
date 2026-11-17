import { Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PEAK_COUNT, Peak } from './peak';
import { ConquestSectionComponent } from '../conquests/conquest-section';
import { PeakGeoSectionComponent } from './peak-geo-section';
import { AuthService } from '../core/auth';

@Component({
  selector: 'app-peak-details',
  imports: [ConquestSectionComponent, PeakGeoSectionComponent, DecimalPipe, MatButtonModule, MatIconModule, MatExpansionModule, TranslocoPipe],
  template: `
    @let p = peak();
    <header class="head">
      <button mat-button (click)="closed.emit()">
        <mat-icon>arrow_back</mat-icon>{{ 'peak.backToList' | transloco }}
      </button>
    </header>

    <article class="body">
      <p class="eyebrow">{{ 'peak.number' | transloco: { number: p.number, total: total } }}</p>
      <h2 class="name">{{ p.name }}</h2>

      @if (auth.isSignedIn()) {
        <!-- Deferred: the conquest UI (dialogs, overlay) is only downloaded for signed-in users. -->
        @defer (on immediate) {
          <app-conquest-section [peak]="p" />
        }
      }

      <dl class="facts">
        <div><dt>{{ 'peak.range' | transloco }}</dt><dd>{{ p.range }}</dd></div>
        <div><dt>{{ 'peak.height' | transloco }}</dt><dd>{{ 'peak.heightValue' | transloco: { height: p.heightMeters } }}</dd></div>
        @if (p.latitude !== null && p.longitude !== null) {
          <div>
            <dt>{{ 'peak.coordinates' | transloco }}</dt>
            <dd>{{ p.latitude | number: '1.5-5' }}° N, {{ p.longitude | number: '1.5-5' }}° E</dd>
          </div>
        }
      </dl>

      @if (osmUrl(); as url) {
        <a mat-stroked-button [href]="url" target="_blank" rel="noopener">
          <mat-icon>map</mat-icon>{{ 'peak.openInOsm' | transloco }}
        </a>
      }

      <!-- Deferred: keeps the trails/parking UI out of the initial bundle. -->
      @defer (on immediate) {
        <app-peak-geo [slug]="p.slug" />
      }

      @if (notes(); as text) {
        <mat-expansion-panel class="notes">
          <mat-expansion-panel-header>
            <mat-panel-title>{{ 'peak.notes' | transloco }}</mat-panel-title>
          </mat-expansion-panel-header>
          <p>{{ text }}</p>
        </mat-expansion-panel>
      }

      <h3 class="sources-title">{{ 'peak.sources' | transloco }}</h3>
      <ul class="sources">
        @for (source of p.sources; track source) {
          <li><a [href]="source" target="_blank" rel="noopener">{{ hostOf(source) }}</a></li>
        }
      </ul>
    </article>
  `,
  styles: `
    :host { display: block; }
    .head { padding: 8px; }
    .body { padding: 0 16px 24px; }
    .eyebrow { margin: 0; color: var(--mat-sys-primary); font: var(--mat-sys-label-large); }
    .name { margin: 4px 0 16px; font: var(--mat-sys-headline-medium); }
    .facts { margin: 0 0 16px; display: grid; gap: 8px; }
    .facts dt { font: var(--mat-sys-label-medium); color: var(--mat-sys-on-surface-variant); }
    .facts dd { margin: 0; font: var(--mat-sys-body-large); }
    .notes { margin: 16px 0; }
    .sources-title { font: var(--mat-sys-title-small); margin: 16px 0 4px; }
    .sources { margin: 0; padding-left: 20px; }
  `,
})
export class PeakDetailsComponent {
  readonly peak = input.required<Peak>();
  readonly closed = output<void>();
  protected readonly auth = inject(AuthService);
  protected readonly total = PEAK_COUNT;

  private readonly lang = toSignal(inject(TranslocoService).langChanges$, { initialValue: 'pl' });

  protected readonly notes = computed(() => {
    const notes = this.peak().notes;
    return notes ? (this.lang() === 'en' ? notes.en : notes.pl) : null;
  });

  protected readonly osmUrl = computed(() => {
    const { latitude, longitude } = this.peak();
    return latitude !== null && longitude !== null
      ? `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`
      : null;
  });

  protected hostOf(url: string): string {
    try {
      const { hostname, pathname } = new URL(url);
      return hostname.replace(/^www\./, '') + decodeURIComponent(pathname).replace(/\/$/, '');
    } catch {
      return url;
    }
  }
}
