import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';
import { PeakDetailsComponent } from './peak-details';
import { Peak } from './peak';
import { getTranslocoModule } from '../testing/transloco-testing';
import { AuthService } from '../core/auth';
import { Conquest, ConquestsService } from '../conquests/conquest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PeakGeoService } from './peak-geo';

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
        provideHttpClient(),
        provideHttpClientTesting(),
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

  describe('trails and parking', () => {
    const trailsUrl = 'http://localhost:5080/api/peaks/skopiec/trails';
    const parkingUrl = 'http://localhost:5080/api/peaks/skopiec/parking';
    const collection = (features: unknown[]) => ({ type: 'FeatureCollection', features });

    async function renderSelected() {
      const fixture = await render(skopiec);
      TestBed.inject(PeakGeoService).slug.set('skopiec');
      // No whenStable here: pending requests keep the app unstable until they're flushed.
      TestBed.tick();
      return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
    }

    async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
      fixture.detectChanges();
      await fixture.whenStable();
    }

    it('lists trails with colour, ref and network as text, and parking with distance, fee and links', async () => {
      const { fixture, http, el } = await renderSelected();
      http.expectOne(trailsUrl).flush(
        collection([
          {
            type: 'Feature',
            geometry: { type: 'MultiLineString', coordinates: [[[15.88, 50.94], [15.89, 50.95]]] },
            properties: { osmId: 'relation/2149829', name: 'Szlak czerwony: Wojcieszów – Skopiec', ref: 'GSS', colour: 'red', network: 'rwn' },
          },
          {
            type: 'Feature',
            geometry: { type: 'MultiLineString', coordinates: [[[15.88, 50.94], [15.87, 50.93]]] },
            properties: { osmId: 'relation/2', name: null, ref: null, colour: null, network: null },
          },
        ]),
      );
      http.expectOne(parkingUrl).flush(
        collection([
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [15.87012, 50.93461] },
            properties: { osmId: 'way/123456', name: 'Parking pod Skopcem', fee: true, capacity: 30, distanceMeters: 1449 },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [15.9, 50.95] },
            properties: { osmId: 'node/7', name: null, fee: null, capacity: null, distanceMeters: 2051 },
          },
        ]),
      );
      await settle(fixture);

      const trails = [...el.querySelectorAll('.trails li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
      expect(trails[0]).toContain('Szlak czerwony: Wojcieszów – Skopiec');
      expect(trails[0]).toContain('Kolor: czerwony');
      expect(trails[0]).toContain('Oznaczenie: GSS');
      expect(trails[0]).toContain('szlak regionalny');
      expect(trails[1]).toContain('Szlak bez nazwy');
      expect(trails[1]).toContain('Kolor: nieznany');

      const parking = [...el.querySelectorAll('.parking li')];
      const first = parking[0].textContent!.replace(/\s+/g, ' ');
      expect(first).toContain('Parking pod Skopcem');
      expect(first).toContain('1,4 km od szczytu w linii prostej');
      expect(first).toContain('płatny');
      expect(first).toContain('miejsc: 30');
      const links = [...parking[0].querySelectorAll('a')].map((a) => a.getAttribute('href'));
      expect(links).toEqual([
        'https://www.openstreetmap.org/directions?to=50.93461,15.87012',
        'https://www.openstreetmap.org/way/123456',
      ]);
      expect(parking[0].querySelector('a')!.textContent).toContain('Nawiguj');
      const second = parking[1].textContent!.replace(/\s+/g, ' ');
      expect(second).toContain('Parking bez nazwy');
      expect(second).toContain('opłata: brak danych');
      expect(second).not.toContain('miejsc');

      const attribution = el.querySelector('.attribution')!;
      expect(attribution.textContent!.replace(/\s+/g, ' ')).toContain('Dane: © współtwórcy OpenStreetMap, licencja ODbL');
      expect(attribution.querySelector('a')!.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright');
      http.verify();
    });

    it('says so when OSM has no trails or parking near the peak, and still credits OSM', async () => {
      const { fixture, http, el } = await renderSelected();
      http.expectOne(trailsUrl).flush(collection([]));
      http.expectOne(parkingUrl).flush(collection([]));
      await settle(fixture);

      expect(el.textContent).toContain('Nie znaleziono szlaków w OpenStreetMap w pobliżu szczytu.');
      expect(el.textContent).toContain('Nie znaleziono parkingów w OpenStreetMap w promieniu 10 km od szczytu.');
      expect(el.querySelector('.attribution')).not.toBeNull();
    });

    it('shows an error with a working retry', async () => {
      const { fixture, http, el } = await renderSelected();
      http.expectOne(trailsUrl).error(new ProgressEvent('error'));
      http.expectOne(parkingUrl).flush(collection([]));
      await settle(fixture);

      const alert = el.querySelector('.trails [role=alert]')!;
      expect(alert.textContent).toContain('Nie udało się wczytać szlaków.');

      alert.querySelector('button')!.click();
      TestBed.tick();
      http.expectOne(trailsUrl).flush(collection([]));
      await settle(fixture);

      expect(el.textContent).toContain('Nie znaleziono szlaków w OpenStreetMap w pobliżu szczytu.');
    });

    it('stays empty and fetches nothing until the peak is selected', async () => {
      const el = (await render(skopiec)).nativeElement as HTMLElement;

      TestBed.inject(HttpTestingController).expectNone(() => true);
      expect(el.querySelector('.attribution')).toBeNull();
    });
  });
});
