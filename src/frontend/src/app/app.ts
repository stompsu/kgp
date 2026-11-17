import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { DOCUMENT } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { tap } from 'rxjs';
import { Language, rememberLanguage } from './core/i18n';
import { AuthService } from './core/auth';
import { UserMenuComponent } from './core/user-menu';

@Component({
  imports: [RouterOutlet, MatToolbarModule, MatButtonModule, TranslocoPipe, UserMenuComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  protected readonly auth = inject(AuthService);

  protected readonly lang = toSignal(
    this.transloco.langChanges$.pipe(tap((lang) => (this.document.documentElement.lang = lang))),
    { initialValue: this.transloco.getActiveLang() },
  );

  protected toggleLanguage(): void {
    const next: Language = this.lang() === 'pl' ? 'en' : 'pl';
    rememberLanguage(next);
    this.transloco.setActiveLang(next);
  }
}
