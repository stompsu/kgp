import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MapPage } from './map-page';
import { MapComponent } from '../map/map';
import { Peak } from '../peaks/peak';
import { getTranslocoModule } from '../testing/transloco-testing';

@Component({ selector: 'app-map', template: '' })
class MapStub {
  readonly peaks = input<Peak[]>([]);
  readonly selectedSlug = input<string | null>(null);
  readonly label = input('');
}

const rysy: Peak = {
  number: 28, slug: 'rysy', name: 'Rysy', range: 'Tatry', heightMeters: 2499,
  latitude: 49.17958, longitude: 20.08811, notes: null, sources: [],
};

describe('MapPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapPage, getTranslocoModule()],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    })
      .overrideComponent(MapPage, { remove: { imports: [MapComponent] }, add: { imports: [MapStub] } })
      .compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists peaks once loaded', async () => {
    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();
    http.expectOne('http://localhost:5080/api/peaks').flush([rysy]);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Rysy');
  });

  it('shows an error with a working retry when the API is unreachable', async () => {
    const fixture = TestBed.createComponent(MapPage);
    fixture.detectChanges();
    http.expectOne('http://localhost:5080/api/peaks').error(new ProgressEvent('error'));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[role=alert]')?.textContent).toContain('Nie udało się wczytać szczytów.');

    el.querySelector<HTMLButtonElement>('[role=alert] button')!.click();
    fixture.detectChanges();
    http.expectOne('http://localhost:5080/api/peaks').flush([rysy]);
    await fixture.whenStable();

    expect(el.textContent).toContain('Rysy');
  });

  it('says so when the slug in the URL is unknown', async () => {
    const fixture = TestBed.createComponent(MapPage);
    fixture.componentRef.setInput('slug', 'giewont');
    fixture.detectChanges();
    http.expectOne('http://localhost:5080/api/peaks').flush([rysy]);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nie znaleziono takiego szczytu.');
  });
});
