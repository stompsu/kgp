import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef } from '@angular/core';
import { PeakGeoService, formatKm } from './peak-geo';

describe('PeakGeoService', () => {
  let http: HttpTestingController;
  let geo: PeakGeoService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    geo = TestBed.inject(PeakGeoService);
  });

  afterEach(() => http.verify());

  it('fetches nothing while no peak is selected', async () => {
    await TestBed.inject(ApplicationRef).whenStable();

    http.expectNone(() => true);
    expect(geo.trailFeatures()).toEqual([]);
    expect(geo.parkingFeatures()).toEqual([]);
  });

  it('fetches parking and trails of the selected peak', async () => {
    geo.slug.set('rysy');
    TestBed.tick();

    http.expectOne('http://localhost:5080/api/peaks/rysy/parking').flush({ type: 'FeatureCollection', features: [] });
    http.expectOne('http://localhost:5080/api/peaks/rysy/trails').flush({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'MultiLineString', coordinates: [[[20.088, 49.179], [20.09, 49.183]]] },
          properties: { osmId: 'relation/1', name: 'Szlak czerwony', ref: null, colour: 'red', network: 'rwn' },
        },
      ],
    });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(geo.trailFeatures().map((t) => t.properties.name)).toEqual(['Szlak czerwony']);
    expect(geo.parkingFeatures()).toEqual([]);
  });

  it('reads as empty instead of throwing when a request fails', async () => {
    geo.slug.set('rysy');
    TestBed.tick();
    http.expectOne('http://localhost:5080/api/peaks/rysy/parking').error(new ProgressEvent('error'));
    http.expectOne('http://localhost:5080/api/peaks/rysy/trails').error(new ProgressEvent('error'));
    await TestBed.inject(ApplicationRef).whenStable();

    expect(geo.trails.error()).toBeTruthy();
    expect(geo.trailFeatures()).toEqual([]);
    expect(geo.parkingFeatures()).toEqual([]);
  });

  it('formats kilometres with one decimal per language', () => {
    expect(formatKm(8370, 'pl')).toBe('8,4');
    expect(formatKm(8370, 'en')).toBe('8.4');
  });
});
