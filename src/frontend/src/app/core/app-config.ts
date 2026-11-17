import { Injectable } from '@angular/core';

export interface RuntimeConfig {
  /** Base URL of the KGP API, without trailing slash. */
  apiBaseUrl: string;
}

const DEFAULTS: RuntimeConfig = { apiBaseUrl: 'http://localhost:5080' };

/**
 * Settings that differ per environment, loaded from /runtime-config.json at startup.
 * The file is generated at deploy time (infra/hooks) so one build works everywhere;
 * locally it is absent and the defaults apply.
 */
@Injectable({ providedIn: 'root' })
export class AppConfig {
  private config: RuntimeConfig = DEFAULTS;

  get apiBaseUrl(): string {
    return this.config.apiBaseUrl;
  }

  async load(): Promise<void> {
    try {
      const response = await fetch('/runtime-config.json', { cache: 'no-store' });
      if (response.ok) {
        const loaded = (await response.json()) as Partial<RuntimeConfig>;
        this.config = { ...DEFAULTS, ...loaded, apiBaseUrl: (loaded.apiBaseUrl ?? DEFAULTS.apiBaseUrl).replace(/\/$/, '') };
      }
    } catch {
      // No config file (local dev): keep defaults.
    }
  }
}
