import { Component, ElementRef, OnDestroy, afterNextRender, effect, input, output, viewChild } from '@angular/core';
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

    effect(() => this.renderMarkers(this.peaks()));
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

    for (const peak of peaks) {
      if (peak.latitude === null || peak.longitude === null) continue;
      const marker = L.marker([peak.latitude, peak.longitude], {
        icon: markerIcon(peak, peak.slug === this.selectedSlug()),
        title: `${peak.number}. ${peak.name} (${peak.heightMeters} m)`,
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
    for (const peak of this.peaks()) {
      this.markers.get(peak.slug)?.setIcon(markerIcon(peak, peak.slug === slug)).setZIndexOffset(peak.slug === slug ? 1000 : 0);
    }
    const marker = slug ? this.markers.get(slug) : undefined;
    if (marker) {
      this.map.flyTo(marker.getLatLng(), Math.max(this.map.getZoom(), 11), { duration: 0.8 });
    }
  }
}

function markerIcon(peak: Peak, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="peak-marker${selected ? ' selected' : ''}"><span>${peak.number}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [3, 28],
  });
}
