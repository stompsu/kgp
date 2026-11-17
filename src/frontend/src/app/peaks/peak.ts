import { Injectable, inject } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { AppConfig } from '../core/app-config';

export interface LocalizedText {
  pl: string;
  en: string;
}

export interface Peak {
  number: number;
  slug: string;
  name: string;
  range: string;
  heightMeters: number;
  latitude: number | null;
  longitude: number | null;
  notes: LocalizedText | null;
  sources: string[];
}

/** Total number of peaks in Korona Gór Polski. */
export const PEAK_COUNT = 28;

@Injectable({ providedIn: 'root' })
export class PeaksService {
  private readonly config = inject(AppConfig);

  /** All 28 peaks, loaded once and shared by the map, list and details panel. */
  readonly peaks = httpResource<Peak[]>(() => `${this.config.apiBaseUrl}/api/peaks`, { defaultValue: [] });
}
