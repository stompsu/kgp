import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth';
import { Peak } from '../peaks/peak';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog';
import { ConquestPhotoComponent } from './conquest-photo';
import { ConquestsService, formatConquestDate } from './conquest';

/** The signed-in user's conquest of one peak, or a button to record it. Renders nothing for guests. */
@Component({
  selector: 'app-conquest-section',
  imports: [MatButtonModule, MatIconModule, ConquestPhotoComponent, TranslocoPipe],
  template: `
    @if (auth.isSignedIn()) {
      <section class="conquest" [class.done]="!!conquest()">
        @if (conquest(); as c) {
          <h3 class="state">
            <mat-icon aria-hidden="true">check_circle</mat-icon>
            {{ 'conquest.conqueredOn' | transloco: { date: date() } }}
          </h3>
          @if (c.notes) {
            <p class="notes">{{ c.notes }}</p>
          }
          @if (c.hasPhoto) {
            <app-conquest-photo [conquest]="c" [alt]="'conquest.photoAlt' | transloco: { name: peak().name }" />
          }
          <div class="actions">
            <button mat-stroked-button (click)="edit()"><mat-icon>edit</mat-icon>{{ 'conquest.edit' | transloco }}</button>
            <button mat-button (click)="remove()" [disabled]="busy()"><mat-icon>delete</mat-icon>{{ 'conquest.delete' | transloco }}</button>
          </div>
        } @else if (resource.isLoading()) {
          <p class="muted" role="status">{{ 'conquest.loading' | transloco }}</p>
        } @else if (resource.error()) {
          <div role="alert">
            <p>{{ 'conquest.loadError' | transloco }}</p>
            <button mat-stroked-button (click)="resource.reload()">{{ 'peaks.retry' | transloco }}</button>
          </div>
        } @else {
          <button mat-flat-button class="mark" (click)="edit()">
            <mat-icon>flag</mat-icon>{{ 'conquest.mark' | transloco }}
          </button>
        }
        @if (message(); as key) {
          <p class="muted" role="status">{{ key | transloco }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .conquest { margin: 0 0 16px; padding: 12px 16px; border-radius: 12px; border: 1px dashed var(--mat-sys-outline); }
    .conquest.done { border: 2px solid var(--mat-sys-primary); background: var(--mat-sys-primary-container); color: var(--mat-sys-on-primary-container); }
    .state { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font: var(--mat-sys-title-medium); }
    .notes { white-space: pre-line; margin: 0 0 8px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .muted { margin: 8px 0 0; color: var(--mat-sys-on-surface-variant); }
  `,
})
export class ConquestSectionComponent {
  readonly peak = input.required<Peak>();

  protected readonly auth = inject(AuthService);
  private readonly conquests = inject(ConquestsService);
  private readonly dialog = inject(MatDialog);
  private readonly lang = toSignal(inject(TranslocoService).langChanges$, { initialValue: 'pl' });

  protected readonly resource = this.conquests.conquests;
  protected readonly conquest = computed(() => this.conquests.bySlug().get(this.peak().slug) ?? null);
  protected readonly date = computed(() => {
    const c = this.conquest();
    return c ? formatConquestDate(c.conqueredOn, this.lang()) : '';
  });
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);

  protected async edit(): Promise<void> {
    this.message.set(null);
    // Lazy: the form pulls in forms, datepicker and inputs, which guests never need.
    const { ConquestDialogComponent } = await import('./conquest-dialog');
    const ref = this.dialog.open(ConquestDialogComponent, {
      data: { peak: this.peak(), conquest: this.conquest() },
      autoFocus: 'first-tabbable',
      maxWidth: '95vw',
    });
    if (await firstValueFrom(ref.afterClosed())) this.message.set('conquest.saved');
  }

  protected async remove(): Promise<void> {
    this.message.set(null);
    const ref = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
      data: {
        title: 'conquest.deleteTitle',
        message: 'conquest.deleteMessage',
        confirm: 'conquest.delete',
        params: { name: this.peak().name },
      },
    });
    if (!(await firstValueFrom(ref.afterClosed()))) return;
    this.busy.set(true);
    try {
      await this.conquests.remove(this.peak().slug);
      this.message.set('conquest.deleted');
    } catch {
      this.message.set('conquest.errors.deleteFailed');
    } finally {
      this.busy.set(false);
    }
  }
}
