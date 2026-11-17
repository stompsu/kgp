import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { MAT_ICON_DEFAULT_OPTIONS } from '@angular/material/icon';
import { routes } from './app.routes';
import { AppConfig } from './core/app-config';
import { AuthService, authInterceptor } from './core/auth';
import { retryStartingInterceptor } from './core/retry-starting';
import { provideI18n } from './core/i18n';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, retryStartingInterceptor])),
    provideRouter(routes, withComponentInputBinding()),
    // Config first, then sign-in: MSAL must process a redirect response before the router starts.
    provideAppInitializer(() => {
      const config = inject(AppConfig);
      const auth = inject(AuthService);
      return config.load().then(() => auth.initialize());
    }),
    provideI18n(),
    // index.html loads the Material Symbols font, whose class is not mat-icon's default.
    { provide: MAT_ICON_DEFAULT_OPTIONS, useValue: { fontSet: 'material-symbols-outlined' } },
  ],
};
