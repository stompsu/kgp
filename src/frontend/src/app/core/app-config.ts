import { Injectable } from '@angular/core';

/** Entra External ID settings for the SPA. Absent (or incomplete) = sign-in is off. */
export interface AuthConfig {
  /** Client ID of the `kgp-spa` app registration. */
  clientId: string;
  /** Issuer-style authority, e.g. `https://<sub>.ciamlogin.com/<tenantId>/v2.0`. */
  authority: string;
  /** Delegated API scope, e.g. `api://<api-client-id>/Conquests.ReadWrite`. */
  apiScope: string;
}

export interface RuntimeConfig {
  /** Base URL of the KGP API, without trailing slash. */
  apiBaseUrl: string;
  auth?: AuthConfig;
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

  /** The sign-in settings, or `undefined` when sign-in is not configured. */
  get auth(): AuthConfig | undefined {
    const auth = this.config.auth;
    return auth?.clientId && auth.authority && auth.apiScope ? auth : undefined;
  }

  async load(): Promise<void> {
    try {
      const response = await fetch('/runtime-config.json', { cache: 'no-store' });
      if (response.ok) {
        this.set((await response.json()) as Partial<RuntimeConfig>);
      }
    } catch {
      // No config file (local dev): keep defaults.
    }
  }

  /** Applies a (partial) runtime config. Used by `load()` and by tests. */
  set(loaded: Partial<RuntimeConfig>): void {
    this.config = { ...DEFAULTS, ...loaded, apiBaseUrl: (loaded.apiBaseUrl ?? DEFAULTS.apiBaseUrl).replace(/\/$/, '') };
  }
}
