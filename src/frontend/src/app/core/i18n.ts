import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { isDevMode } from '@angular/core';

export const LANGUAGES = ['pl', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'kgp.lang';

@Injectable({ providedIn: 'root' })
class HttpTranslationLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string) {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

/** Remembered choice, else browser language if English, else Polish. */
export function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'pl' || stored === 'en') return stored;
  } catch {
    // Storage blocked: fall through.
  }
  return navigator.language?.toLowerCase().startsWith('pl') ? 'pl' : navigator.language ? 'en' : 'pl';
}

export function rememberLanguage(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not critical.
  }
}

export function provideI18n() {
  return provideTransloco({
    config: {
      availableLangs: [...LANGUAGES],
      defaultLang: initialLanguage(),
      fallbackLang: 'pl',
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
    },
    loader: HttpTranslationLoader,
  });
}
