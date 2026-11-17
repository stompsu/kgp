import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';
import { PeakDetailsComponent } from './peak-details';
import { Peak } from './peak';
import { getTranslocoModule } from '../testing/transloco-testing';
import { AuthService } from '../core/auth';
import { Conquest, ConquestsService } from '../conquests/conquest';

const skopiec: Peak = {
  number: 3,
  slug: 'skopiec',
  name: 'Skopiec',
  range: 'Góry Kaczawskie',
  heightMeters: 721,
  latitude: 50.94393,
  longitude: 15.88471,
  notes: { pl: 'Wyższe jest Okole (PL).', en: 'Okole is higher (EN).' },
  sources: ['https://kgp.info.pl/wykaz-szczytow/', 'https://www.openstreetmap.org/node/1'],
};

const conquest: Conquest = {
  peakSlug: 'skopiec', peakNumber: 3, conqueredOn: '2025-08-14', notes: 'Od Przełęczy Komarnickiej.',
  hasPhoto: true, photoTakenAt: null, updatedAt: '2025-08-15T19:03:22Z',
};

describe('PeakDetailsComponent', () => {
  const signedIn = signal(false);
  const bySlug = signal(new Map<string, Conquest>());

  beforeEach(() => {
    signedIn.set(false);
    bySlug.set(new Map());
  });

  async function render(peak: Peak) {
    await TestBed.configureTestingModule({
      imports: [PeakDetailsComponent, getTranslocoModule()],
      providers: [
        { provide: AuthService, useValue: { isSignedIn: signedIn, enabled: signedIn } },
        {
          provide: ConquestsService,
          useValue: {
            bySlug,
            conquests: { isLoading: () => false, error: () => undefined, reload: () => true },
            loadPhoto: () => of(new Blob(['jpeg'], { type: 'image/jpeg' })),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PeakDetailsComponent);
    fixture.componentRef.setInput('peak', peak);
    await fixture.whenStable();
    return fixture;
  }

  it('shows number, name, range, height and coordinates', async () => {
    const el = (await render(skopiec)).nativeElement as HTMLElement;

    expect(el.textContent).toContain('Szczyt nr 3 z 28');
    expect(el.querySelector('h2')?.textContent).toContain('Skopiec');
    expect(el.textContent).toContain('Góry Kaczawskie');
    expect(el.textContent).toContain('721 m n.p.m.');
    expect(el.textContent).toContain('50.94393° N, 15.88471° E');
  });

  it('shows notes in the active language', async () => {
    const fixture = await render(skopiec);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Wyższe jest Okole (PL).');

    TestBed.inject(TranslocoService).setActiveLang('en');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(el.textContent).toContain('Okole is higher (EN).');
  });

  it('hides the notes panel for undisputed peaks', async () => {
    const el = (await render({ ...skopiec, notes: null })).nativeElement as HTMLElement;

    expect(el.querySelector('mat-expansion-panel')).toBeNull();
  });

  it('emits closed when going back to the list', async () => {
    const fixture = await render(skopiec);
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('header button')!.click();

    expect(closed).toBe(true);
  });

  describe('conquest', () => {
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:photo');
      URL.revokeObjectURL = vi.fn();
    });

    it('is hidden for guests', async () => {
      const el = (await render(skopiec)).nativeElement as HTMLElement;

      expect(el.querySelector('app-conquest-section')).toBeNull();
      expect(el.textContent).not.toContain('Oznacz jako zdobyty');
    });

    it('offers "Oznacz jako zdobyty" for a peak not conquered yet', async () => {
      signedIn.set(true);
      const el = (await render(skopiec)).nativeElement as HTMLElement;

      expect(el.textContent).toContain('Oznacz jako zdobyty');
      expect(el.textContent).not.toContain('Zdobyty 14.08.2025');
    });

    it('shows date, notes and photo of a conquered peak, and frees the photo URL on destroy', async () => {
      signedIn.set(true);
      bySlug.set(new Map([['skopiec', conquest]]));
      const fixture = await render(skopiec);
      const el = fixture.nativeElement as HTMLElement;

      expect(el.textContent).toContain('Zdobyty 14.08.2025');
      expect(el.textContent).toContain('Od Przełęczy Komarnickiej.');
      expect(el.textContent).not.toContain('Oznacz jako zdobyty');
      expect(el.querySelector('img')?.getAttribute('src')).toBe('blob:photo');
      expect(el.querySelector('img')?.getAttribute('alt')).toBe('Zdjęcie ze szczytu Skopiec');
      expect([...el.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(
        expect.arrayContaining([expect.stringContaining('Edytuj'), expect.stringContaining('Usuń')]),
      );

      fixture.destroy();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
    });
  });
});
