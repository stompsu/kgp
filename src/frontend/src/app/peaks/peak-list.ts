import { Component, input, output } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { TranslocoPipe } from '@jsverse/transloco';
import { Peak } from './peak';

@Component({
  selector: 'app-peak-list',
  imports: [MatListModule, TranslocoPipe],
  template: `
    <h2 class="title">{{ 'peaks.listTitle' | transloco }}</h2>
    <p class="hint">{{ 'peaks.listHint' | transloco }}</p>
    <mat-nav-list>
      @for (peak of peaks(); track peak.slug) {
        <a mat-list-item (click)="peakSelected.emit(peak.slug)" (keydown.enter)="peakSelected.emit(peak.slug)" tabindex="0">
          <span matListItemAvatar class="badge">{{ peak.number }}</span>
          <span matListItemTitle>{{ peak.name }}</span>
          <span matListItemLine>{{ peak.range }} · {{ peak.heightMeters }} m</span>
        </a>
      }
    </mat-nav-list>
  `,
  styles: `
    .title { font: var(--mat-sys-title-large); margin: 16px 16px 0; }
    .hint { margin: 4px 16px 8px; color: var(--mat-sys-on-surface-variant); }
    .badge {
      display: grid; place-items: center;
      background: var(--mat-sys-primary-container); color: var(--mat-sys-on-primary-container);
      font: var(--mat-sys-label-large);
    }
  `,
})
export class PeakListComponent {
  readonly peaks = input.required<Peak[]>();
  readonly peakSelected = output<string>();
}
