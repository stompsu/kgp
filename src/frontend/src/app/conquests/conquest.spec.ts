import { TestBed } from '@angular/core/testing';
import { ApplicationRef, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppConfig } from '../core/app-config';
import { AuthService } from '../core/auth';
import { Conquest, ConquestsService, formatConquestDate } from './conquest';

const API = 'https://api.example.test';
const rysy: Conquest = {
  peakSlug: 'rysy', peakNumber: 28, conqueredOn: '2025-08-14', notes: null,
  hasPhoto: true, photoTakenAt: null, updatedAt: '2025-08-15T19:03:22Z',
};

describe('ConquestsService', () => {
  let http: HttpTestingController;
  const signedIn = signal(false);

  beforeEach(() => {
    signedIn.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isSignedIn: signedIn } },
      ],
    });
    TestBed.inject(AppConfig).set({ apiBaseUrl: API });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads nothing for guests and the list once signed in', async () => {
    const service = TestBed.inject(ConquestsService);
    TestBed.tick();
    http.expectNone(`${API}/api/me/conquests`);
    expect(service.count()).toBe(0);

    signedIn.set(true);
    TestBed.tick();
    http.expectOne(`${API}/api/me/conquests`).flush([rysy]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.count()).toBe(1);
    expect(service.conqueredSlugs().has('rysy')).toBe(true);
  });

  it('uploads the photo as multipart field "file" and updates the list', async () => {
    signedIn.set(true);
    const service = TestBed.inject(ConquestsService);
    TestBed.tick();
    http.expectOne(`${API}/api/me/conquests`).flush([]);

    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const upload = service.uploadPhoto('rysy', file);
    const req = http.expectOne(`${API}/api/me/conquests/rysy/photo`);
    expect(req.request.method).toBe('PUT');
    expect((req.request.body as FormData).get('file')).toBeInstanceOf(File);
    req.flush(rysy);
    await upload;

    expect(service.bySlug().get('rysy')).toEqual(rysy);
  });

  it('busts the photo cache with updatedAt', () => {
    const service = TestBed.inject(ConquestsService);
    expect(service.photoUrl(rysy)).toBe(`${API}/api/me/conquests/rysy/photo?v=2025-08-15T19%3A03%3A22Z`);
  });

  it('formats the date per language', () => {
    expect(formatConquestDate('2025-08-14', 'pl')).toBe('14.08.2025');
    expect(formatConquestDate('2025-08-14', 'en')).toBe('14/08/2025');
  });
});
