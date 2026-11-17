import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { DateAdapter, MAT_DATE_FORMATS, MAT_NATIVE_DATE_FORMATS } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerIntl, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Peak } from '../peaks/peak';
import {
  Conquest,
  ConquestsService,
  MAX_PHOTO_BYTES,
  MIN_CONQUEST_DATE,
  NOTES_MAX_LENGTH,
  PHOTO_ACCEPT,
  fromIsoDate,
  toIsoDate,
} from './conquest';
import { KgpDateAdapter } from './date-adapter';

export interface ConquestDialogData {
  peak: Peak;
  conquest: Conquest | null;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Date not after today and not before 1900-01-01 (the API checks the same, in Europe/Warsaw). */
export function conquestDateValidator(today: () => Date = startOfToday): ValidatorFn {
  const min = fromIsoDate(MIN_CONQUEST_DATE);
  return (control: AbstractControl<Date | null>): ValidationErrors | null => {
    const value = control.value;
    if (!(value instanceof Date) || isNaN(value.getTime())) return null;
    const day = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    if (day > today()) return { future: true };
    if (day < min) return { tooEarly: true };
    return null;
  };
}

/** Client-side photo check; the API checks the bytes again. Returns an i18n key or null. */
export function photoProblem(file: File): string | null {
  if (file.size > MAX_PHOTO_BYTES) return 'conquest.errors.photoTooLarge';
  const name = file.name.toLowerCase();
  const typeOk = /^image\/(jpeg|png|heic|heif)$/.test(file.type) || /\.(jpe?g|png|heic|heif)$/.test(name);
  return typeOk ? null : 'conquest.errors.photoType';
}

type ServerField = 'conqueredOn' | 'notes';

/** Maps the `errors` of a 400 validation problem to our field names (case and `$.` prefixes vary by binder). */
function serverFields(error: HttpErrorResponse): ServerField[] {
  const errors = (error.error as { errors?: Record<string, unknown> } | null)?.errors;
  if (!errors || typeof errors !== 'object') return [];
  const fields = new Set<ServerField>();
  for (const key of Object.keys(errors)) {
    const k = key.toLowerCase().replace(/[^a-z]/g, '');
    if (k.endsWith('conqueredon')) fields.add('conqueredOn');
    else if (k.endsWith('notes')) fields.add('notes');
  }
  return [...fields];
}

function photoErrorKey(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 413) return 'conquest.errors.photoTooLarge';
    if (error.status === 415) return 'conquest.errors.photoType';
  }
  return 'conquest.errors.photoUpload';
}

/** Add or edit the conquest of one peak: date, notes, optional photo. Closes with the saved Conquest. */
@Component({
  selector: 'app-conquest-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    TranslocoPipe,
  ],
  providers: [
    { provide: DateAdapter, useClass: KgpDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MAT_NATIVE_DATE_FORMATS },
  ],
  template: `
    <h2 mat-dialog-title>
      {{ (data.conquest ? 'conquest.editTitle' : 'conquest.addTitle') | transloco: { name: data.peak.name } }}
    </h2>
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="content">
        <mat-form-field>
          <mat-label>{{ 'conquest.date' | transloco }}</mat-label>
          <input matInput [matDatepicker]="picker" formControlName="conqueredOn" [min]="minDate" [max]="maxDate" required />
          <mat-hint>{{ 'conquest.dateHint' | transloco }}</mat-hint>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
          @let date = form.controls.conqueredOn;
          @if (date.hasError('matDatepickerParse')) {
            <mat-error>{{ 'conquest.errors.dateInvalid' | transloco }}</mat-error>
          } @else if (date.hasError('required')) {
            <mat-error>{{ 'conquest.errors.dateRequired' | transloco }}</mat-error>
          } @else if (date.hasError('future') || date.hasError('matDatepickerMax')) {
            <mat-error>{{ 'conquest.errors.dateFuture' | transloco }}</mat-error>
          } @else if (date.hasError('tooEarly') || date.hasError('matDatepickerMin')) {
            <mat-error>{{ 'conquest.errors.dateTooEarly' | transloco }}</mat-error>
          } @else if (date.hasError('server')) {
            <mat-error>{{ 'conquest.errors.dateServer' | transloco }}</mat-error>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>{{ 'conquest.notes' | transloco }}</mat-label>
          <textarea matInput formControlName="notes" rows="4" [maxlength]="notesMax"></textarea>
          <mat-hint align="end">{{ form.controls.notes.value.length }} / {{ notesMax }}</mat-hint>
          @if (form.controls.notes.hasError('maxlength')) {
            <mat-error>{{ 'conquest.errors.notesTooLong' | transloco: { max: notesMax } }}</mat-error>
          } @else if (form.controls.notes.hasError('server')) {
            <mat-error>{{ 'conquest.errors.notesServer' | transloco }}</mat-error>
          }
        </mat-form-field>

        <div class="photo">
          <span class="label">{{ 'conquest.photo' | transloco }}</span>
          <input #fileInput type="file" class="file" [accept]="accept" (change)="onFileSelected($event)" tabindex="-1" aria-hidden="true" />
          <div class="photo-actions">
            <button mat-stroked-button type="button" (click)="fileInput.click()" aria-describedby="photo-hint">
              <mat-icon>add_photo_alternate</mat-icon>{{ (data.conquest?.hasPhoto ? 'conquest.replacePhoto' : 'conquest.choosePhoto') | transloco }}
            </button>
            @if (data.conquest?.hasPhoto && !file() && !removePhoto()) {
              <button mat-button type="button" (click)="removePhoto.set(true)">
                <mat-icon>hide_image</mat-icon>{{ 'conquest.removePhoto' | transloco }}
              </button>
            }
          </div>
          @if (file(); as f) {
            <p class="file-name">{{ f.name }} <button mat-button type="button" (click)="clearFile()">{{ 'conquest.clearPhoto' | transloco }}</button></p>
          } @else if (removePhoto()) {
            <p class="file-name">{{ 'conquest.photoWillBeRemoved' | transloco }} <button mat-button type="button" (click)="removePhoto.set(false)">{{ 'conquest.undo' | transloco }}</button></p>
          }
          <p id="photo-hint" class="hint">{{ 'conquest.photoHint' | transloco }}</p>
          @if (photoError(); as key) {
            <p class="error" role="alert">{{ key | transloco }}</p>
          }
        </div>

        @if (formError(); as key) {
          <p class="error" role="alert">{{ key | transloco }}</p>
        }
      </mat-dialog-content>

      @if (saving()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">{{ 'conquest.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="saving()">{{ 'conquest.save' | transloco }}</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .content { display: flex; flex-direction: column; gap: 8px; min-width: min(420px, 80vw); }
    .photo { display: grid; gap: 4px; }
    .label { font: var(--mat-sys-label-large); }
    .photo-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .file-name { margin: 0; word-break: break-all; }
    .hint { margin: 0; font: var(--mat-sys-body-small); color: var(--mat-sys-on-surface-variant); }
    .error { margin: 0; color: var(--mat-sys-error); }
  `,
})
export class ConquestDialogComponent {
  protected readonly data = inject<ConquestDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<ConquestDialogComponent, Conquest>>(MatDialogRef);
  private readonly conquests = inject(ConquestsService);
  private readonly transloco = inject(TranslocoService);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);
  private readonly datepickerIntl = inject(MatDatepickerIntl);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly accept = PHOTO_ACCEPT;
  protected readonly notesMax = NOTES_MAX_LENGTH;
  protected readonly minDate = fromIsoDate(MIN_CONQUEST_DATE);
  protected readonly maxDate = startOfToday();

  readonly form = new FormGroup({
    conqueredOn: new FormControl<Date | null>(this.data.conquest ? fromIsoDate(this.data.conquest.conqueredOn) : null, [
      Validators.required,
      conquestDateValidator(),
    ]),
    notes: new FormControl(this.data.conquest?.notes ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(NOTES_MAX_LENGTH)],
    }),
  });

  readonly file = signal<File | null>(null);
  readonly photoError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  protected readonly removePhoto = signal(false);
  protected readonly saving = signal(false);

  constructor() {
    this.dateAdapter.setLocale(this.transloco.getActiveLang() === 'en' ? 'en-GB' : 'pl-PL');
    this.translateDatepicker();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectFile(input.files?.[0] ?? null);
  }

  selectFile(file: File | null): void {
    this.photoError.set(null);
    if (file) {
      const problem = photoProblem(file);
      if (problem) {
        this.photoError.set(problem);
        this.file.set(null);
        this.resetInput();
        return;
      }
      this.removePhoto.set(false);
    }
    this.file.set(file);
  }

  protected clearFile(): void {
    this.selectFile(null);
    this.resetInput();
  }

  async submit(): Promise<void> {
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const slug = this.data.peak.slug;
    const { conqueredOn, notes } = this.form.getRawValue();
    this.saving.set(true);

    // 1. The conquest itself (the photo endpoint needs it to exist).
    let saved: Conquest;
    try {
      saved = await this.conquests.save(slug, { conqueredOn: toIsoDate(conqueredOn!), notes: notes.trim() || null });
    } catch (error) {
      this.showSaveError(error);
      this.saving.set(false);
      return;
    }

    // 2. The photo, if it changed. On failure the conquest is already saved, so say exactly that.
    try {
      const file = this.file();
      if (file) {
        saved = await this.conquests.uploadPhoto(slug, file);
      } else if (this.removePhoto() && this.data.conquest?.hasPhoto) {
        await this.conquests.deletePhoto(slug);
        saved = this.conquests.bySlug().get(slug) ?? saved;
      }
    } catch (error) {
      this.photoError.set(photoErrorKey(error));
      this.formError.set('conquest.errors.savedWithoutPhoto');
      this.data.conquest = saved;
      this.saving.set(false);
      return;
    }

    this.saving.set(false);
    this.dialogRef.close(saved);
  }

  private showSaveError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 400) {
      const fields = serverFields(error);
      for (const field of fields) {
        const control = this.form.controls[field];
        control.setErrors({ ...control.errors, server: true });
        control.markAsTouched();
      }
      this.formError.set(fields.length ? null : 'conquest.errors.invalid');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.formError.set('conquest.errors.signedOut');
      return;
    }
    this.formError.set('conquest.errors.generic');
  }

  private resetInput(): void {
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }

  private translateDatepicker(): void {
    const t = (key: string) => this.transloco.translate(`datepicker.${key}`);
    const intl = this.datepickerIntl;
    intl.calendarLabel = t('calendar');
    intl.openCalendarLabel = t('open');
    intl.closeCalendarLabel = t('close');
    intl.prevMonthLabel = t('prevMonth');
    intl.nextMonthLabel = t('nextMonth');
    intl.prevYearLabel = t('prevYear');
    intl.nextYearLabel = t('nextYear');
    intl.prevMultiYearLabel = t('prevMultiYear');
    intl.nextMultiYearLabel = t('nextMultiYear');
    intl.switchToMonthViewLabel = t('chooseDate');
    intl.switchToMultiYearViewLabel = t('chooseMonthYear');
    intl.changes.next();
  }
}
