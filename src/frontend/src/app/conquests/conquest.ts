import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { AppConfig } from '../core/app-config';
import { AuthService } from '../core/auth';

/** A peak the signed-in user has conquered (docs/api.md, `Conquest`). */
export interface Conquest {
  peakSlug: string;
  peakNumber: number;
  /** ISO date, `YYYY-MM-DD`. */
  conqueredOn: string;
  notes: string | null;
  hasPhoto: boolean;
  photoTakenAt: string | null;
  /** UTC; changes on every edit and photo upload. */
  updatedAt: string;
}

export interface ConquestRequest {
  conqueredOn: string;
  notes: string | null;
}

/** Photo upload limit, same as the API: 15 × 1024 × 1024 bytes. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/heic,image/heif,.heic,.heif';
export const NOTES_MAX_LENGTH = 2000;
export const MIN_CONQUEST_DATE = '1900-01-01';

/** The signed-in user's conquests, plus the calls that change them. Nothing is loaded for guests. */
@Injectable({ providedIn: 'root' })
export class ConquestsService {
  private readonly config = inject(AppConfig);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  private get baseUrl(): string {
    return `${this.config.apiBaseUrl}/api/me/conquests`;
  }

  readonly conquests = httpResource<Conquest[]>(() => (this.auth.isSignedIn() ? this.baseUrl : undefined), {
    defaultValue: [],
  });

  /** Safe read: `resource.value()` throws while the resource is in an error state. */
  readonly list = computed(() => (this.auth.isSignedIn() && this.conquests.hasValue() ? this.conquests.value() : []));
  readonly bySlug = computed(() => new Map(this.list().map((c) => [c.peakSlug, c])));
  readonly conqueredSlugs = computed(() => new Set(this.bySlug().keys()));
  readonly count = computed(() => this.bySlug().size);

  async save(slug: string, request: ConquestRequest): Promise<Conquest> {
    const saved = await firstValueFrom(this.http.put<Conquest>(this.url(slug), request));
    this.upsertLocal(saved);
    return saved;
  }

  async remove(slug: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(this.url(slug)));
    this.removeLocal(slug);
  }

  async uploadPhoto(slug: string, file: File): Promise<Conquest> {
    const body = new FormData();
    body.append('file', file, file.name);
    const saved = await firstValueFrom(this.http.put<Conquest>(`${this.url(slug)}/photo`, body));
    this.upsertLocal(saved);
    return saved;
  }

  async deletePhoto(slug: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete<void>(`${this.url(slug)}/photo`));
    } catch (error) {
      // Already gone is fine.
      if (!(error instanceof HttpErrorResponse && error.status === 404)) throw error;
    }
    const current = this.bySlug().get(slug);
    if (current) this.upsertLocal({ ...current, hasPhoto: false, photoTakenAt: null, updatedAt: new Date().toISOString() });
  }

  /** Photo URL with a cache buster, so a replaced photo isn't served from the browser cache. */
  photoUrl(conquest: Conquest): string {
    return `${this.url(conquest.peakSlug)}/photo?v=${encodeURIComponent(conquest.updatedAt)}`;
  }

  /** The photo as a Blob (it needs the bearer token, so an `<img src>` can't load it directly). */
  loadPhoto(conquest: Conquest): Observable<Blob> {
    return this.http.get(this.photoUrl(conquest), { responseType: 'blob' });
  }

  private url(slug: string): string {
    return `${this.baseUrl}/${encodeURIComponent(slug)}`;
  }

  private upsertLocal(conquest: Conquest): void {
    const others = this.list().filter((c) => c.peakSlug !== conquest.peakSlug);
    this.conquests.set([...others, conquest].sort((a, b) => a.peakNumber - b.peakNumber));
  }

  private removeLocal(slug: string): void {
    this.conquests.set(this.list().filter((c) => c.peakSlug !== slug));
  }
}

/** Local calendar date as `YYYY-MM-DD`. */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD` as a local Date at midnight. */
export function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** `14.08.2025` in Polish, `14/08/2025` in English. */
export function formatConquestDate(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fromIsoDate(iso));
}
