import { Component, ElementRef, OnDestroy, afterNextRender, effect, input, output, untracked, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { Peak } from '../peaks/peak';

/** Bounds of the KGP peaks with a margin; the whole crown is in southern Poland. */
const INITIAL_BOUNDS = L.latLngBounds([48.9, 15.2], [51.1, 23.0]);

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

  private readonly mapHost = viewChild.required<ElementRef<HTMLDivElement>>('mapHost');
  private map?: L.Map;
  private readonly markers = new Map<string, L.Marker>();
  private readonly layer = L.layerGroup();

  private resizeObserver?: ResizeObserver;
  private fitted = false;

  constructor() {
    afterNextRender(() => {
      const host = this.mapHost().nativeElement;
      this.map = L.map(host, { zoomControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);
      this.layer.addTo(this.map);

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
        }
      });
      this.resizeObserver.observe(host);
    });

    effect(() => {
      this.conquered();
      this.conqueredLabel();
      this.renderMarkers(this.peaks());
    });
    effect(() => this.focusSelected(this.selectedSlug()));
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

  private focusSelected(slug: string | null): void {
    if (!this.map || !this.fitted) return;
    // Untracked: a new conquest shouldn't make the map fly back to the selected peak.
    const conquered = untracked(this.conquered);
    for (const peak of this.peaks()) {
      this.markers.get(peak.slug)?.setIcon(markerIcon(peak, peak.slug === slug, conquered.has(peak.slug))).setZIndexOffset(peak.slug === slug ? 1000 : 0);
    }
    const marker = slug ? this.markers.get(slug) : undefined;
    if (marker) {
      this.map.flyTo(marker.getLatLng(), Math.max(this.map.getZoom(), 11), { duration: 0.8 });
    }
  }
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
