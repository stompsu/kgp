import { Component, ElementRef, OnDestroy, afterNextRender, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { map as mapTo, switchMap } from 'rxjs';
import * as L from 'leaflet';
import { Peak } from '../peaks/peak';
import { ParkingFeature, TrailFeature, formatKm, trailColour } from '../peaks/peak-geo';
import { LayerPrefs, OverlayId, loadLayerPrefs, saveLayerPrefs } from './layer-prefs';

/** Closest zoom when fitting the selected peak and its trails, so small screens keep some context. */
const TRAIL_FIT_MAX_ZOOM = 14;

/** Bounds of the KGP peaks with a margin; the whole crown is in southern Poland. */
const INITIAL_BOUNDS = L.latLngBounds([48.9, 15.2], [51.1, 23.0]);

/**
 * OSM's tile usage policy blocks requests without a Referer. Static Web Apps sends `Referrer-Policy: same-origin`
 * by default, which strips it, so each tile asks for the origin explicitly (never the path).
 */
export const TILE_REFERRER_POLICY = 'strict-origin-when-cross-origin' as const;

@Component({
  selector: 'app-map',
  template: `<div #mapHost class="map" role="region" [attr.aria-label]="label()"></div>`,
  styles: `
    :host { display: block; height: 100%; }
    .map { height: 100%; width: 100%; }
  `,
})
export class MapComponent implements OnDestroy {
  readonly peaks = input.required<Peak[]>();
  readonly selectedSlug = input<string | null>(null);
  readonly label = input('');
  /** Slugs of conquered peaks; their markers get a different shape and a check mark, not just a colour. */
  readonly conquered = input<ReadonlySet<string>>(new Set());
  /** Translated word appended to a conquered marker's accessible name. */
  readonly conqueredLabel = input('');
  readonly peakSelected = output<string>();
  /** Trails and parking of the selected peak (empty when none is selected or still loading). */
  readonly trails = input<TrailFeature[]>([]);
  readonly parking = input<ParkingFeature[]>([]);

  private readonly mapHost = viewChild.required<ElementRef<HTMLDivElement>>('mapHost');
  private map?: L.Map;
  private readonly markers = new Map<string, L.Marker>();
  private readonly layer = L.layerGroup();

  private resizeObserver?: ResizeObserver;
  private fitted = false;

  private readonly transloco = inject(TranslocoService);
  /** The active language, emitted only once its translations are loaded (so `translate` doesn't return keys). */
  private readonly lang = toSignal(
    this.transloco.langChanges$.pipe(switchMap((lang) => this.transloco.selectTranslation(lang).pipe(mapTo(() => lang)))),
  );

  private readonly prefs: LayerPrefs = loadLayerPrefs();
  private readonly overlays: Record<OverlayId, L.Layer> = {
    trails: L.layerGroup(),
    parking: L.layerGroup(),
    waymarked: L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
      maxZoom: 18,
      referrerPolicy: TILE_REFERRER_POLICY,
      opacity: 0.7,
      zIndex: 2,
      attribution: '&copy; <a href="https://waymarkedtrails.org">waymarkedtrails.org</a> (CC BY-SA)',
    }),
  };
  private layersControl?: L.Control.Layers;
  /** Slug whose trails the view was last fitted to, so re-renders (language, toggles) don't move the map. */
  private trailsFittedFor: string | null = null;
  /** The peak the map last zoomed to; null until its marker exists. */
  private focusedFor: string | null = null;

  constructor() {
    afterNextRender(() => {
      const host = this.mapHost().nativeElement;
      this.map = L.map(host, { zoomControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        referrerPolicy: TILE_REFERRER_POLICY,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);
      this.layer.addTo(this.map);
      for (const [id, layer] of this.overlayEntries()) {
        if (this.prefs[id]) layer.addTo(this.map);
      }
      this.map.on('overlayadd overlayremove', (e: L.LeafletEvent) => {
        const id = this.overlayEntries().find(([, layer]) => layer === (e as L.LayersControlEvent).layer)?.[0];
        if (!id) return;
        this.prefs[id] = e.type === 'overlayadd';
        saveLayerPrefs(this.prefs);
      });

      // The container gets its size from CSS grid after first render (and changes on mobile/desktop
      // switches), so wait for a real size before fitting, and keep Leaflet in sync afterwards.
      this.resizeObserver = new ResizeObserver(() => {
        if (!this.map || host.clientWidth === 0 || host.clientHeight === 0) return;
        this.map.invalidateSize();
        if (!this.fitted) {
          this.fitted = true;
          this.map.fitBounds(INITIAL_BOUNDS);
          this.renderMarkers(this.peaks());
          this.focusSelected(this.selectedSlug());
          this.renderLayersControl();
          this.renderGeo();
        }
      });
      this.resizeObserver.observe(host);
    });

    effect(() => {
      this.conquered();
      this.conqueredLabel();
      this.renderMarkers(this.peaks());
      // A deep link selects the peak before its marker exists; zoom once it does.
      untracked(() => {
        const slug = this.selectedSlug();
        if (slug && this.focusedFor !== slug) this.focusSelected(slug);
      });
    });
    // Only the selection: peaks arriving or reloading are handled after the markers render, above.
    effect(() => {
      const slug = this.selectedSlug();
      untracked(() => this.focusSelected(slug));
    });
    effect(() => {
      this.lang();
      this.renderLayersControl();
    });
    effect(() => {
      this.lang();
      this.trails();
      this.parking();
      untracked(() => this.renderGeo());
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private renderMarkers(peaks: Peak[]): void {
    if (!this.map || !this.fitted) return;
    this.layer.clearLayers();
    this.markers.clear();

    const conquered = this.conquered();
    const conqueredLabel = this.conqueredLabel();
    for (const peak of peaks) {
      if (peak.latitude === null || peak.longitude === null) continue;
      const done = conquered.has(peak.slug);
      const marker = L.marker([peak.latitude, peak.longitude], {
        icon: markerIcon(peak, peak.slug === this.selectedSlug(), done),
        title: `${peak.number}. ${peak.name} (${peak.heightMeters} m)${done && conqueredLabel ? ` – ${conqueredLabel}` : ''}`,
        alt: peak.name,
        keyboard: true,
        riseOnHover: true,
      });
      marker.on('click keypress', () => this.peakSelected.emit(peak.slug));
      marker.addTo(this.layer);
      this.markers.set(peak.slug, marker);
    }
  }

  private overlayEntries(): [OverlayId, L.Layer][] {
    return Object.entries(this.overlays) as [OverlayId, L.Layer][];
  }

  /** Leaflet's layers control: keyboard-operable checkboxes; rebuilt when the language changes. */
  private renderLayersControl(): void {
    if (!this.map || !this.fitted || !this.lang()) return;
    this.layersControl?.remove();
    const t = (key: string) => this.transloco.translate(key);
    this.layersControl = L.control
      .layers(
        undefined,
        {
          [escapeHtml(t('map.layers.trails'))]: this.overlays.trails,
          [escapeHtml(t('map.layers.parking'))]: this.overlays.parking,
          [escapeHtml(t('map.layers.waymarked'))]: this.overlays.waymarked,
        },
        { collapsed: true, position: 'topright' },
      )
      .addTo(this.map);
    const toggle = this.layersControl.getContainer()?.querySelector<HTMLElement>('.leaflet-control-layers-toggle');
    toggle?.setAttribute('title', t('map.layers.control'));
    toggle?.setAttribute('aria-label', t('map.layers.control'));
  }

  /** Draws the selected peak's trails (cased lines with a text tooltip) and parking ("P" markers). */
  private renderGeo(): void {
    if (!this.map || !this.fitted || !this.lang()) return;
    const trailsLayer = this.overlays.trails as L.LayerGroup;
    const parkingLayer = this.overlays.parking as L.LayerGroup;
    trailsLayer.clearLayers();
    parkingLayer.clearLayers();
    const t = (key: string, params?: Record<string, unknown>) => this.transloco.translate(key, params);
    const lang = this.lang()!;

    const bounds = L.latLngBounds([]);
    for (const trail of this.trails()) {
      const { name, ref, colour } = trail.properties;
      const lines = trail.geometry.coordinates.map((line) => line.map(([lon, lat]) => L.latLng(lat, lon)));
      if (lines.length === 0) continue;
      const tooltip = [
        name ?? t('geo.unnamedTrail'),
        ref ? t('geo.ref', { ref }) : null,
        t('geo.colourLabel', { colour: t(`geo.colour.${colour ?? 'unknown'}`) }),
      ]
        .filter(Boolean)
        .map((part) => escapeHtml(part!))
        .join('<br>');
      // White casing under the coloured line so it reads on the OSM base; unknown colour is dashed.
      L.polyline(lines, { color: '#fff', weight: 8, opacity: 0.9, interactive: false }).addTo(trailsLayer);
      const line = L.polyline(lines, { color: trailColour(colour), weight: 4, dashArray: colour ? undefined : '8 6' })
        .bindTooltip(tooltip, { sticky: true })
        .addTo(trailsLayer);
      bounds.extend(line.getBounds());
    }

    for (const parking of this.parking()) {
      const [lon, lat] = parking.geometry.coordinates;
      const name = parking.properties.name ?? t('geo.unnamedParking');
      const title = `${name}, ${t('geo.distance', { km: formatKm(parking.properties.distanceMeters, lang) })}`;
      L.marker([lat, lon], {
        icon: L.divIcon({ className: '', html: '<div class="parking-marker" aria-hidden="true">P</div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        title,
        alt: title,
        keyboard: true,
      })
        .bindTooltip(escapeHtml(title))
        .addTo(parkingLayer);
    }

    // Once per selection: show the summit and its trails, never zooming past TRAIL_FIT_MAX_ZOOM.
    const slug = this.selectedSlug();
    const summit = slug ? this.markers.get(slug)?.getLatLng() : undefined;
    if (!slug) this.trailsFittedFor = null;
    if (summit && bounds.isValid() && this.trailsFittedFor !== slug && this.map.hasLayer(trailsLayer)) {
      this.trailsFittedFor = slug;
      this.map.flyToBounds(bounds.extend(summit), { maxZoom: TRAIL_FIT_MAX_ZOOM, padding: [24, 24], duration: 0.8 });
    }
  }

  private focusSelected(slug: string | null): void {
    if (!this.map || !this.fitted) return;
    // Untracked: a new conquest shouldn't make the map fly back to the selected peak.
    const conquered = untracked(this.conquered);
    for (const peak of this.peaks()) {
      this.markers.get(peak.slug)?.setIcon(markerIcon(peak, peak.slug === slug, conquered.has(peak.slug))).setZIndexOffset(peak.slug === slug ? 1000 : 0);
    }
    const marker = slug ? this.markers.get(slug) : undefined;
    this.focusedFor = marker ? slug : null;
    if (marker) {
      this.map.flyTo(marker.getLatLng(), Math.max(this.map.getZoom(), 11), { duration: 0.8 });
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function markerIcon(peak: Peak, selected: boolean, conquered: boolean): L.DivIcon {
  const classes = ['peak-marker', selected ? 'selected' : '', conquered ? 'conquered' : ''].filter(Boolean).join(' ');
  const check = conquered ? '<span class="peak-check" aria-hidden="true">✓</span>' : '';
  return L.divIcon({
    className: '',
    html: `<div class="${classes}"><span>${peak.number}</span></div>${check}`,
    iconSize: [28, 28],
    iconAnchor: [3, 28],
  });
}
