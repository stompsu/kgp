import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth';
import { getTranslocoModule } from './testing/transloco-testing';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, getTranslocoModule()],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('shows the Polish title and the verification disclaimer by default', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('h1')?.textContent).toContain('Korona Gór Polski');
    expect(el.querySelector('.disclaimer')?.textContent).toContain('Nie zastępuje oficjalnej weryfikacji');
  });

  it('switches to English', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('mat-toolbar button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(el.querySelector('h1')?.textContent).toContain('Crown of Polish Mountains');
  });

  it('has no sign-in button when sign-in is not configured', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Zaloguj się');
  });

  it('shows the sign-in button when sign-in is configured', async () => {
    const signIn = vi.fn();
    TestBed.overrideProvider(AuthService, {
      useValue: { enabled: signal(true), account: signal(null), displayName: signal(null), isSignedIn: signal(false), signIn },
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes('Zaloguj się'));

    expect(button).toBeTruthy();
    button!.click();
    expect(signIn).toHaveBeenCalled();
  });
});
