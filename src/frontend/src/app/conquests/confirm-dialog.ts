import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';

export interface ConfirmDialogData {
  /** i18n keys. */
  title: string;
  message: string;
  confirm: string;
  params?: Record<string, unknown>;
}

/** Yes/no question. Closes with `true` when confirmed. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ data.title | transloco: data.params }}</h2>
    <mat-dialog-content>{{ data.message | transloco: data.params }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false" cdkFocusInitial>{{ 'conquest.cancel' | transloco }}</button>
      <button mat-flat-button class="danger" [mat-dialog-close]="true">{{ data.confirm | transloco }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    .danger { background: var(--mat-sys-error); color: var(--mat-sys-on-error); }
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
