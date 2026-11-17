import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from './auth';

/** Toolbar sign-in button, or the signed-in user's menu. Only rendered when sign-in is configured (deferred in app.html). */
@Component({
  selector: 'app-user-menu',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, TranslocoPipe],
  template: `
    @if (auth.account(); as user) {
      <button
        mat-button
        class="user"
        [matMenuTriggerFor]="userMenu"
        [attr.aria-label]="'auth.accountMenu' | transloco: { name: auth.displayName() }">
        <mat-icon>account_circle</mat-icon><span class="user-name">{{ auth.displayName() }}</span>
      </button>
      <mat-menu #userMenu="matMenu" xPosition="before">
        <div class="menu-user">
          <span>{{ user.name || user.username }}</span>
          @if (user.name && user.username !== user.name) {
            <small>{{ user.username }}</small>
          }
        </div>
        <button mat-menu-item (click)="auth.signOut()">
          <mat-icon>logout</mat-icon>{{ 'auth.signOut' | transloco }}
        </button>
      </mat-menu>
    } @else {
      <button mat-stroked-button class="sign-in" (click)="auth.signIn()">
        <mat-icon>login</mat-icon>{{ 'auth.signIn' | transloco }}
      </button>
    }
  `,
  styles: `
    :host { display: inline-flex; }
    button { color: inherit; }
    .sign-in { border-color: currentColor; margin-left: 8px; }
    .user-name { max-width: 16ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .menu-user {
      display: flex; flex-direction: column; padding: 8px 16px;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      small { color: var(--mat-sys-on-surface-variant); }
    }
    @media (max-width: 599px) { .user-name { display: none; } }
  `,
})
export class UserMenuComponent {
  protected readonly auth = inject(AuthService);
}
