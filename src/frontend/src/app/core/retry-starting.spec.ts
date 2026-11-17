import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retryStartingInterceptor } from './retry-starting';

describe('retryStartingInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([retryStartingInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    vi.useRealTimers();
  });

  it('retries a GET answered with 503 after Retry-After', () => {
    let result: unknown;
    http.get('/api/peaks').subscribe((r) => (result = r));

    backend.expectOne('/api/peaks').flush(null, { status: 503, statusText: 'Starting', headers: { 'Retry-After': '2' } });
    vi.advanceTimersByTime(1999);
    backend.expectNone('/api/peaks');
    vi.advanceTimersByTime(1);
    backend.expectOne('/api/peaks').flush([1]);

    expect(result).toEqual([1]);
  });

  it('does not retry other errors or non-GET requests', () => {
    let status = 0;
    http.get('/api/peaks/x').subscribe({ error: (e) => (status = e.status) });
    backend.expectOne('/api/peaks/x').flush(null, { status: 404, statusText: 'Not Found' });
    expect(status).toBe(404);

    http.put('/api/me/x', {}).subscribe({ error: (e) => (status = e.status) });
    backend.expectOne('/api/me/x').flush(null, { status: 503, statusText: 'Starting' });
    expect(status).toBe(503);
  });
});
