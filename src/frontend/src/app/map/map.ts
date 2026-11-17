import { Component, ElementRef, OnDestroy, afterNextRender, viewChild } from '@angular/core';
import * as L from 'leaflet';

/** Geographic centre of Poland, roughly; zoom shows the whole country. */
const POLAND_CENTER: L.LatLngExpression = [52.07, 19.48];
const POLAND_ZOOM = 6;

@Component({
  selector: 'app-map',
  template: `<div #mapHost class="map" role="region" aria-label="Mapa szczytów Korony Gór Polski"></div>`,
  styles: `
    :host { display: block; height: 100%; }
    .map { height: 100%; width: 100%; }
  `,
})
export class MapComponent implements OnDestroy {
  private readonly mapHost = viewChild.required<ElementRef<HTMLDivElement>>('mapHost');
  private map?: L.Map;

  constructor() {
    afterNextRender(() => {
      this.map = L.map(this.mapHost().nativeElement).setView(POLAND_CENTER, POLAND_ZOOM);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(this.map);
    });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
