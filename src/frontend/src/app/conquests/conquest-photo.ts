import { Component, effect, inject, input, signal } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { Conquest, ConquestsService } from './conquest';

/** Shows a conquest photo. It's fetched with the bearer token as a Blob and shown through an object URL. */
@Component({
  selector: 'app-conquest-photo',
  imports: [MatProgressSpinnerModule, TranslocoPipe],
  template: `
    @if (src(); as url) {
      <img class="photo" [src]="url" [alt]="alt()" />
    } @else if (failed()) {
      <p class="failed" role="status">{{ 'conquest.photoLoadFailed' | transloco }}</p>
    } @else {
      <mat-progress-spinner mode="indeterminate" diameter="32" [attr.aria-label]="'conquest.photoLoading' | transloco" />
    }
  `,
  styles: `
    :host { display: block; }
    .photo { display: block; max-width: 100%; max-height: 320px; border-radius: 8px; object-fit: contain; }
    .failed { color: var(--mat-sys-on-surface-variant); font: var(--mat-sys-body-small); }
  `,
})
export class ConquestPhotoComponent {
  readonly conquest = input.required<Conquest>();
  readonly alt = input('');

  private readonly conquests = inject(ConquestsService);
  protected readonly src = signal<string | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    effect((onCleanup) => {
      const conquest = this.conquest();
      this.src.set(null);
      this.failed.set(false);
      let objectUrl: string | null = null;
      const sub = this.conquests.loadPhoto(conquest).subscribe({
        next: (blob) => {
          objectUrl = URL.createObjectURL(blob);
          this.src.set(objectUrl);
        },
        error: () => this.failed.set(true),
      });
      // Runs when the conquest changes and when the component is destroyed.
      onCleanup(() => {
        sub.unsubscribe();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
    });
  }
}
