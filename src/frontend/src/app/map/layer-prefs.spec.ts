import { DEFAULT_LAYER_PREFS, LAYER_PREFS_KEY, loadLayerPrefs, saveLayerPrefs } from './layer-prefs';

describe('map layer prefs', () => {
  it('defaults to trails and parking on, Waymarked Trails off', () => {
    expect(loadLayerPrefs({ getItem: () => null })).toEqual({ trails: true, parking: true, waymarked: false });
  });

  it('round-trips through storage', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };

    saveLayerPrefs({ trails: false, parking: true, waymarked: true }, storage);

    expect(JSON.parse(store.get(LAYER_PREFS_KEY)!)).toEqual({ trails: false, parking: true, waymarked: true });
    expect(loadLayerPrefs(storage)).toEqual({ trails: false, parking: true, waymarked: true });
  });

  it('ignores junk and blocked storage', () => {
    expect(loadLayerPrefs({ getItem: () => '{"waymarked":"yes","trails":false}' })).toEqual({ ...DEFAULT_LAYER_PREFS, trails: false });
    expect(loadLayerPrefs({ getItem: () => 'not json' })).toEqual(DEFAULT_LAYER_PREFS);
    expect(
      loadLayerPrefs({
        getItem: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      }),
    ).toEqual(DEFAULT_LAYER_PREFS);
    expect(() =>
      saveLayerPrefs(DEFAULT_LAYER_PREFS, {
        setItem: () => {
          throw new DOMException('full', 'QuotaExceededError');
        },
      }),
    ).not.toThrow();
  });
});
