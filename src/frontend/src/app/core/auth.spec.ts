import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AppConfig } from './app-config';
import { AuthService, MSAL_LOADER, authInterceptor, msalAuthority } from './auth';

const API = 'https://api.example.test';
const AUTH = {
  clientId: 'spa-client-id',
  authority: 'https://kgptest.ciamlogin.com/11111111-2222-3333-4444-555555555555/v2.0',
  apiScope: 'api://api-client-id/Conquests.ReadWrite',
};
const ACCOUNT = { homeAccountId: 'h', localAccountId: 'l', environment: 'e', tenantId: 't', username: 'anna@example.com', name: 'Anna' };

class FakeInteractionRequiredAuthError extends Error {}

/** A stand-in for the msal-browser module: no network, no redirects. */
function fakeMsal(options: { accounts?: unknown[]; silent?: () => Promise<{ accessToken: string }> } = {}) {
  const client = {
    config: undefined as unknown,
    initialize: vi.fn(async () => undefined),
    handleRedirectPromise: vi.fn(async () => null),
    getActiveAccount: vi.fn(() => null),
    getAllAccounts: vi.fn(() => options.accounts ?? []),
    setActiveAccount: vi.fn(),
    loginRedirect: vi.fn(async () => undefined),
    logoutRedirect: vi.fn(async () => undefined),
    acquireTokenSilent: vi.fn(options.silent ?? (async () => ({ accessToken: 'token-123' }))),
    acquireTokenRedirect: vi.fn(async () => undefined),
  };
  const module = {
    PublicClientApplication: class {
      constructor(config: unknown) {
        client.config = config;
        return client;
      }
    },
    BrowserCacheLocation: { LocalStorage: 'localStorage' },
    InteractionRequiredAuthError: FakeInteractionRequiredAuthError,
  };
  return { client, loader: vi.fn(async () => module) };
}

function setup(auth: typeof AUTH | undefined, msal = fakeMsal()) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: MSAL_LOADER, useValue: msal.loader },
    ],
  });
  TestBed.inject(AppConfig).set({ apiBaseUrl: API, auth });
  return { auth: TestBed.inject(AuthService), ...msal };
}

const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('msalAuthority', () => {
  it('drops /v2.0 and lists the CIAM host as the known authority', () => {
    expect(msalAuthority(AUTH.authority)).toEqual({
      authority: 'https://kgptest.ciamlogin.com/11111111-2222-3333-4444-555555555555',
      knownAuthorities: ['kgptest.ciamlogin.com'],
    });
  });

  it('rejects a non-https authority', () => {
    expect(() => msalAuthority('http://kgptest.ciamlogin.com/t/v2.0')).toThrow();
  });
});

describe('AuthService', () => {
  it('stays disabled and never loads msal when sign-in is not configured', async () => {
    const { auth, loader } = setup(undefined);
    await auth.initialize();

    expect(auth.enabled()).toBe(false);
    expect(auth.isSignedIn()).toBe(false);
    expect(loader).not.toHaveBeenCalled();
    expect(await auth.getToken()).toBeNull();
  });

  it('configures msal for External ID and restores a cached account', async () => {
    const { auth, client } = setup(AUTH, fakeMsal({ accounts: [ACCOUNT] }));
    await auth.initialize();

    expect(client.config).toMatchObject({
      auth: {
        clientId: 'spa-client-id',
        authority: 'https://kgptest.ciamlogin.com/11111111-2222-3333-4444-555555555555',
        knownAuthorities: ['kgptest.ciamlogin.com'],
      },
    });
    expect(client.handleRedirectPromise).toHaveBeenCalled();
    expect(auth.enabled()).toBe(true);
    expect(auth.isSignedIn()).toBe(true);
    expect(auth.displayName()).toBe('Anna');
  });

  it('signs in by redirect with the API scope', async () => {
    const { auth, client } = setup(AUTH);
    await auth.initialize();
    await auth.signIn();

    expect(auth.isSignedIn()).toBe(false);
    expect(client.loginRedirect).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ['openid', 'offline_access', AUTH.apiScope] }),
    );
  });

  it('falls back to a redirect when a silent token needs interaction', async () => {
    const msal = fakeMsal({
      accounts: [ACCOUNT],
      silent: async () => {
        throw new FakeInteractionRequiredAuthError('login_required');
      },
    });
    const { auth, client } = setup(AUTH, msal);
    await auth.initialize();

    expect(await auth.getToken()).toBeNull();
    expect(client.acquireTokenRedirect).toHaveBeenCalledWith(expect.objectContaining({ scopes: [AUTH.apiScope] }));
  });
});

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  async function signedIn() {
    const { auth } = setup(AUTH, fakeMsal({ accounts: [ACCOUNT] }));
    await auth.initialize();
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  }

  afterEach(() => controller.verify());

  it('adds the bearer token to /api/me/ calls of our API', async () => {
    await signedIn();
    const response = firstValueFrom(http.get(`${API}/api/me/conquests`));
    await tick();

    const req = controller.expectOne(`${API}/api/me/conquests`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    req.flush([]);
    await response;
  });

  it('does not add it to public API calls or to other hosts', async () => {
    await signedIn();
    http.get(`${API}/api/peaks`).subscribe();
    http.get('https://evil.example/api/me/conquests').subscribe();
    http.get(`${API}.evil.example/api/me/conquests`).subscribe();
    http.get('/i18n/pl.json').subscribe();
    await tick();

    for (const url of [`${API}/api/peaks`, 'https://evil.example/api/me/conquests', `${API}.evil.example/api/me/conquests`, '/i18n/pl.json']) {
      const req = controller.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    }
  });

  it('passes requests through untouched when sign-in is off', async () => {
    setup(undefined);
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    http.get(`${API}/api/me/conquests`).subscribe();

    const req = controller.expectOne(`${API}/api/me/conquests`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });
});
