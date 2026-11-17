import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { from, switchMap } from 'rxjs';
import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser';
import { AppConfig, AuthConfig } from './app-config';

type MsalModule = typeof import('@azure/msal-browser');

/**
 * Loads msal-browser on demand so it stays out of the initial bundle (and is never
 * downloaded when sign-in is not configured). Replaced by a fake in tests.
 */
export const MSAL_LOADER = new InjectionToken<() => Promise<MsalModule>>('MSAL_LOADER', {
  providedIn: 'root',
  factory: () => () => import('@azure/msal-browser'),
});

/** The signed-in user as far as the UI cares. Name/email come from the ID token and are never stored by us. */
export interface SignedInUser {
  name: string | null;
  username: string;
}

/**
 * Turns the issuer-style authority from runtime-config (`https://<sub>.ciamlogin.com/<tenantId>/v2.0`)
 * into what msal-browser wants for Entra External ID: the authority without `/v2.0`, and its host
 * as the only known authority (CIAM hosts are not in MSAL's cloud discovery list).
 */
export function msalAuthority(authority: string): { authority: string; knownAuthorities: string[] } {
  const url = new URL(authority);
  if (url.protocol !== 'https:') throw new Error(`Authority must be https: ${authority}`);
  const path = url.pathname.replace(/\/+$/, '').replace(/\/v2\.0$/i, '');
  return { authority: `${url.origin}${path}`, knownAuthorities: [url.host] };
}

/**
 * Sign-in with Entra External ID through msal-browser (redirect flow, auth code + PKCE).
 * Signal-based; `enabled` is false when runtime-config has no `auth` section.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(AppConfig);
  private readonly loadMsal = inject(MSAL_LOADER);

  private msal?: MsalModule;
  private client?: IPublicClientApplication;
  private settings?: AuthConfig;

  private readonly _enabled = signal(false);
  private readonly _account = signal<AccountInfo | null>(null);

  /** Sign-in is configured and msal initialized. */
  readonly enabled = this._enabled.asReadonly();
  readonly account = computed<SignedInUser | null>(() => {
    const account = this._account();
    return account ? { name: account.name ?? null, username: account.username } : null;
  });
  readonly isSignedIn = computed(() => this._account() !== null);
  readonly displayName = computed(() => {
    const account = this.account();
    return account ? account.name || account.username : null;
  });

  /** Called once at startup, after the runtime config is loaded. Never throws: a broken setup just disables sign-in. */
  async initialize(): Promise<void> {
    const settings = this.config.auth;
    if (!settings) return;
    try {
      const msal = await this.loadMsal();
      const client = new msal.PublicClientApplication({
        auth: {
          clientId: settings.clientId,
          ...msalAuthority(settings.authority),
          redirectUri: window.location.origin,
          postLogoutRedirectUri: window.location.origin,
        },
        cache: { cacheLocation: msal.BrowserCacheLocation.LocalStorage },
      });
      await client.initialize();
      const result = await client.handleRedirectPromise();
      const account = result?.account ?? client.getActiveAccount() ?? client.getAllAccounts()[0] ?? null;
      client.setActiveAccount(account);

      this.msal = msal;
      this.client = client;
      this.settings = settings;
      this._account.set(account);
      this._enabled.set(true);
    } catch (error) {
      console.error('Sign-in is unavailable', error);
    }
  }

  private get scopes(): string[] {
    return ['openid', 'offline_access', this.settings!.apiScope];
  }

  async signIn(): Promise<void> {
    await this.client?.loginRedirect({ scopes: this.scopes, prompt: 'select_account' });
  }

  async signOut(): Promise<void> {
    const account = this._account();
    if (!this.client) return;
    await this.client.logoutRedirect({ account: account ?? undefined });
  }

  /**
   * An access token for the KGP API, or null when not signed in. If the session can't be renewed silently
   * the browser is redirected to sign in again (the pending request then never completes, which is fine:
   * the page is about to unload).
   */
  async getToken(): Promise<string | null> {
    const client = this.client;
    const account = this._account();
    if (!client || !account || !this.msal) return null;
    const request = { scopes: [this.settings!.apiScope], account };
    try {
      return (await client.acquireTokenSilent(request)).accessToken;
    } catch (error) {
      if (error instanceof this.msal.InteractionRequiredAuthError) {
        await client.acquireTokenRedirect(request);
        return null;
      }
      throw error;
    }
  }
}

/** Adds the bearer token, but only to calls to our own API's `/api/me/` endpoints. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const prefix = `${inject(AppConfig).apiBaseUrl}/api/me/`;
  const auth = inject(AuthService);
  if (!auth.enabled() || !req.url.startsWith(prefix)) return next(req);
  return from(auth.getToken()).pipe(
    switchMap((token) => next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req)),
  );
};
