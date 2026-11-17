import { Injectable, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { AppConfig } from '../core/app-config';

/** `[longitude, latitude]`, WGS84 (GeoJSON order). */
export type Position = [number, number];

export interface Feature<G, P> {
  type: 'Feature';
  geometry: G;
  properties: P;
}

export interface FeatureCollection<F> {
  type: 'FeatureCollection';
  features: F[];
}

export interface ParkingProperties {
  /** E.g. `way/123456`; the path part of an openstreetmap.org URL. */
  osmId: string;
  name: string | null;
  /** `null` = unknown. */
  fee: boolean | null;
  /** `null` = unknown. */
  capacity: number | null;
  /** Straight-line distance to the summit, not a walking distance. */
  distanceMeters: number;
}

export type TrailColour = 'red' | 'blue' | 'green' | 'yellow' | 'black';
export type TrailNetwork = 'iwn' | 'nwn' | 'rwn' | 'lwn';

export interface TrailProperties {
  osmId: string;
  name: string | null;
  ref: string | null;
  colour: TrailColour | null;
  network: TrailNetwork | null;
}

export type ParkingFeature = Feature<{ type: 'Point'; coordinates: Position }, ParkingProperties>;
export type TrailFeature = Feature<{ type: 'MultiLineString'; coordinates: Position[][] }, TrailProperties>;

/** Display colours for the trail marks; tuned to read on the OSM base map. */
export const TRAIL_COLOURS: Record<TrailColour, string> = {
  red: '#d32f2f',
  blue: '#1565c0',
  green: '#2e7d32',
  yellow: '#f9a825',
  black: '#212121',
};
/** For trails without a colour tag. */
export const TRAIL_COLOUR_UNKNOWN = '#7b1fa2';

/**
 * Parking and trails near the selected peak (docs/api.md, "Parking and trails (M3)").
 * Nothing is fetched until a slug is selected; both lists reload when it changes.
 */
@Injectable({ providedIn: 'root' })
export class PeakGeoService {
  private readonly config = inject(AppConfig);

  /** Slug of the selected peak, or `null` when none is selected. */
  readonly slug = signal<string | null>(null);

  readonly parking = httpResource<FeatureCollection<ParkingFeature>>(() => this.url('parking'));
  readonly trails = httpResource<FeatureCollection<TrailFeature>>(() => this.url('trails'));

  /** Safe reads: `resource.value()` throws while the resource is in an error state. */
  readonly parkingFeatures = computed(() => (this.parking.hasValue() ? (this.parking.value()?.features ?? []) : []));
  readonly trailFeatures = computed(() => (this.trails.hasValue() ? (this.trails.value()?.features ?? []) : []));

  private url(kind: 'parking' | 'trails'): string | undefined {
    const slug = this.slug();
    return slug ? `${this.config.apiBaseUrl}/api/peaks/${encodeURIComponent(slug)}/${kind}` : undefined;
  }
}

export function trailColour(colour: TrailColour | null): string {
  return colour ? TRAIL_COLOURS[colour] : TRAIL_COLOUR_UNKNOWN;
}

/** Kilometres with one decimal in the language's number format, e.g. `8,4` (pl) or `8.4` (en). */
export function formatKm(meters: number, lang: string): string {
  return new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    meters / 1000,
  );
}
