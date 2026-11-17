/** Optional map overlays the user can toggle. */
export type OverlayId = 'trails' | 'parking' | 'waymarked';

export type LayerPrefs = Record<OverlayId, boolean>;

export const OVERLAY_IDS: readonly OverlayId[] = ['trails', 'parking', 'waymarked'];

/** Our trails and parking on, the Waymarked Trails tile overlay off. */
export const DEFAULT_LAYER_PREFS: Readonly<LayerPrefs> = { trails: true, parking: true, waymarked: false };

export const LAYER_PREFS_KEY = 'kgp.mapLayers';

/** Reads the saved toggles (accessing `localStorage` itself can throw, hence inside the try); storage may be missing, blocked or hold junk, so fall back to the defaults. */
export function loadLayerPrefs(storage?: Pick<Storage, 'getItem'>): LayerPrefs {
  const prefs = { ...DEFAULT_LAYER_PREFS };
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage)?.getItem(LAYER_PREFS_KEY) ?? 'null') as unknown;
    if (saved && typeof saved === 'object') {
      for (const id of OVERLAY_IDS) {
        const value = (saved as Record<string, unknown>)[id];
        if (typeof value === 'boolean') prefs[id] = value;
      }
    }
  } catch {
    // Private mode, blocked storage or invalid JSON: defaults.
  }
  return prefs;
}

export function saveLayerPrefs(prefs: LayerPrefs, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? globalThis.localStorage)?.setItem(LAYER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Quota or blocked storage: the toggle still works for this session.
  }
}
