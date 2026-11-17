import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConquestDialogComponent, ConquestDialogData, conquestDateValidator, photoProblem } from './conquest-dialog';
import { Conquest, ConquestsService, MAX_PHOTO_BYTES } from './conquest';
import { Peak } from '../peaks/peak';
import { getTranslocoModule } from '../testing/transloco-testing';

const rysy: Peak = {
  number: 28, slug: 'rysy', name: 'Rysy', range: 'Tatry', heightMeters: 2499,
  latitude: 49.17958, longitude: 20.08811, notes: null, sources: [],
};
const saved: Conquest = {
  peakSlug: 'rysy', peakNumber: 28, conqueredOn: '2025-08-14', notes: null,
  hasPhoto: false, photoTakenAt: null, updatedAt: '2025-08-15T19:03:22Z',
};

function fileOfSize(size: number, name = 'szczyt.jpg', type = 'image/jpeg'): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('conquest form rules', () => {
  const today = () => new Date(2026, 10, 17);
  const validate = (value: Date) => conquestDateValidator(today)({ value } as never);

  it('rejects a future date and accepts today', () => {
    expect(validate(new Date(2026, 10, 18))).toEqual({ future: true });
    expect(validate(new Date(2026, 10, 17, 23, 59))).toBeNull();
  });

  it('rejects dates before 1900-01-01', () => {
    expect(validate(new Date(1899, 11, 31))).toEqual({ tooEarly: true });
    expect(validate(new Date(1900, 0, 1))).toBeNull();
  });

  it('rejects photos over 15 MB and of other types', () => {
    expect(photoProblem(fileOfSize(MAX_PHOTO_BYTES))).toBeNull();
    expect(photoProblem(fileOfSize(MAX_PHOTO_BYTES + 1))).toBe('conquest.errors.photoTooLarge');
    expect(photoProblem(fileOfSize(100, 'IMG_0001.HEIC', ''))).toBeNull();
    expect(photoProblem(fileOfSize(100, 'mapa.gif', 'image/gif'))).toBe('conquest.errors.photoType');
  });
});

describe('ConquestDialogComponent', () => {
  let service: { save: ReturnType<typeof vi.fn>; uploadPhoto: ReturnType<typeof vi.fn>; deletePhoto: ReturnType<typeof vi.fn>; bySlug: ReturnType<typeof signal> };
  let close: ReturnType<typeof vi.fn>;

  async function render(data: ConquestDialogData = { peak: rysy, conquest: null }) {
    service = {
      save: vi.fn(async () => saved),
      uploadPhoto: vi.fn(async () => ({ ...saved, hasPhoto: true })),
      deletePhoto: vi.fn(async () => undefined),
      bySlug: signal(new Map()),
    };
    close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ConquestDialogComponent, getTranslocoModule()],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
        { provide: ConquestsService, useValue: service },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConquestDialogComponent);
    await fixture.whenStable();
    return fixture;
  }

  it('does not save a future date and says why', async () => {
    const fixture = await render();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    fixture.componentInstance.form.controls.conqueredOn.setValue(tomorrow);
    await fixture.componentInstance.submit();
    await fixture.whenStable();

    expect(fixture.componentInstance.form.controls.conqueredOn.hasError('future')).toBe(true);
    expect(service.save).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Data nie może być z przyszłości.');
  });

  it('rejects a photo over 15 MB before uploading anything', async () => {
    const fixture = await render();
    fixture.componentInstance.selectFile(fileOfSize(16 * 1024 * 1024));
    await fixture.whenStable();

    expect(fixture.componentInstance.file()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent).toContain(
      'Zdjęcie jest za duże. Maksymalny rozmiar to 15 MB.',
    );
  });

  it('limits notes to 2000 characters', async () => {
    const fixture = await render();
    fixture.componentInstance.form.controls.notes.setValue('a'.repeat(2001));

    expect(fixture.componentInstance.form.controls.notes.hasError('maxlength')).toBe(true);
  });

  it('saves the conquest first, then uploads the photo, then closes', async () => {
    const fixture = await render();
    const photo = fileOfSize(1024);
    fixture.componentInstance.form.setValue({ conqueredOn: new Date(2025, 7, 14), notes: '  Mgła.  ' });
    fixture.componentInstance.selectFile(photo);
    await fixture.componentInstance.submit();

    expect(service.save).toHaveBeenCalledWith('rysy', { conqueredOn: '2025-08-14', notes: 'Mgła.' });
    expect(service.uploadPhoto).toHaveBeenCalledWith('rysy', photo);
    expect(service.save.mock.invocationCallOrder[0]).toBeLessThan(service.uploadPhoto.mock.invocationCallOrder[0]);
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ hasPhoto: true }));
  });

  it('shows server validation errors on the matching field', async () => {
    const fixture = await render();
    service.save.mockRejectedValueOnce(
      new HttpErrorResponse({ status: 400, error: { errors: { ConqueredOn: ['Date is in the future.'] } } }),
    );
    fixture.componentInstance.form.setValue({ conqueredOn: new Date(2025, 7, 14), notes: '' });
    await fixture.componentInstance.submit();
    await fixture.whenStable();

    expect(fixture.componentInstance.form.controls.conqueredOn.hasError('server')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Serwer odrzucił tę datę.');
    expect(close).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with a translated message when the server rejects the photo', async () => {
    const fixture = await render();
    service.uploadPhoto.mockRejectedValueOnce(new HttpErrorResponse({ status: 415 }));
    fixture.componentInstance.form.setValue({ conqueredOn: new Date(2025, 7, 14), notes: '' });
    fixture.componentInstance.selectFile(fileOfSize(1024));
    await fixture.componentInstance.submit();
    await fixture.whenStable();
    const text = (fixture.nativeElement as HTMLElement).textContent;

    expect(close).not.toHaveBeenCalled();
    expect(text).toContain('Nieobsługiwany format zdjęcia.');
    expect(text).toContain('Zdobycie zapisano, ale zdjęcia nie.');
  });
});
