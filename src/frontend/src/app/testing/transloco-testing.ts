import { TranslocoTestingModule, TranslocoTestingOptions } from '@jsverse/transloco';
import pl from '../../../public/i18n/pl.json';
import en from '../../../public/i18n/en.json';

export function getTranslocoModule(options: TranslocoTestingOptions = {}) {
  return TranslocoTestingModule.forRoot({
    langs: { pl, en },
    translocoConfig: { availableLangs: ['pl', 'en'], defaultLang: 'pl', reRenderOnLangChange: true },
    preloadLangs: true,
    ...options,
  });
}
