import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
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
});
