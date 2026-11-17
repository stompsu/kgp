import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapComponent } from './map';
import { LAYER_PREFS_KEY } from './layer-prefs';
import { getTranslocoModule } from '../testing/transloco-testing';
import { Peak } from '../peaks/peak';

/** Reaches into the component for the Leaflet map and overlays; jsdom has no layout to click the control. */
type MapInternals = { map: L.Map; overlays: Record<'trails' | 'parking' | 'waymarked', L.Layer> };

describe('MapComponent layer toggles', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => store.get(key) ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => void store.set(key, value));
    globalThis.ResizeObserver ??= class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => vi.restoreAllMocks());

  async function render() {
    await TestBed.configureTestingModule({ imports: [MapComponent, getTranslocoModule()] }).compileComponents();
    const fixture = TestBed.createComponent(MapComponent);
    fixture.componentRef.setInput('peaks', []);
    await fixture.whenStable();
    return { fixture, internals: fixture.componentInstance as unknown as MapInternals };
  }

  it('starts from the saved toggles', async () => {
    store.set(LAYER_PREFS_KEY, JSON.stringify({ trails: false, parking: true, waymarked: true }));
    const { internals } = await render();

    expect(internals.map.hasLayer(internals.overlays.trails)).toBe(false);
    expect(internals.map.hasLayer(internals.overlays.parking)).toBe(true);
    expect(internals.map.hasLayer(internals.overlays.waymarked)).toBe(true);
  });

  it('shows our layers but not Waymarked Trails by default, and remembers changes', async () => {
    const { internals } = await render();
    expect(internals.map.hasLayer(internals.overlays.trails)).toBe(true);
    expect(internals.map.hasLayer(internals.overlays.waymarked)).toBe(false);

    internals.map.fire('overlayadd', { layer: internals.overlays.waymarked, name: 'Waymarked Trails' });
    internals.map.fire('overlayremove', { layer: internals.overlays.parking, name: 'Parkingi' });

    expect(JSON.parse(store.get(LAYER_PREFS_KEY)!)).toEqual({ trails: true, parking: false, waymarked: true });
  });

  it('zooms to a deep-linked peak once the peaks arrive after the map is sized', async () => {
    const { fixture, internals } = await render();
    fixture.componentRef.setInput('selectedSlug', 'rysy');
    // What the ResizeObserver does once the container has a size; jsdom has no layout to trigger it.
    (internals as unknown as { fitted: boolean }).fitted = true;
    await fixture.whenStable();
    const flyTo = vi.spyOn(internals.map, 'flyTo').mockReturnValue(internals.map);

    // Test data only; the test checks that the map flies to whatever position the peak has.
    const peak: Peak = { number: 28, slug: 'rysy', name: 'Rysy', range: 'Tatry', heightMeters: 0, latitude: 49.18, longitude: 20.09, notes: null, sources: [] };
    fixture.componentRef.setInput('peaks', [peak]);
    await fixture.whenStable();

    expect(flyTo).toHaveBeenCalledTimes(1);
    expect(flyTo.mock.calls[0][0]).toEqual(L.latLng(49.18, 20.09));
  });
});
