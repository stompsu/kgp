import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { PeakDetailsComponent } from './peak-details';
import { Peak } from './peak';
import { getTranslocoModule } from '../testing/transloco-testing';

const skopiec: Peak = {
  number: 3,
  slug: 'skopiec',
  name: 'Skopiec',
  range: 'Góry Kaczawskie',
  heightMeters: 721,
  latitude: 50.94393,
  longitude: 15.88471,
  notes: { pl: 'Wyższe jest Okole (PL).', en: 'Okole is higher (EN).' },
  sources: ['https://kgp.info.pl/wykaz-szczytow/', 'https://www.openstreetmap.org/node/1'],
};

describe('PeakDetailsComponent', () => {
  async function render(peak: Peak) {
    await TestBed.configureTestingModule({
      imports: [PeakDetailsComponent, getTranslocoModule()],
    }).compileComponents();
    const fixture = TestBed.createComponent(PeakDetailsComponent);
    fixture.componentRef.setInput('peak', peak);
    await fixture.whenStable();
    return fixture;
  }

  it('shows number, name, range, height and coordinates', async () => {
    const el = (await render(skopiec)).nativeElement as HTMLElement;

    expect(el.textContent).toContain('Szczyt nr 3 z 28');
    expect(el.querySelector('h2')?.textContent).toContain('Skopiec');
    expect(el.textContent).toContain('Góry Kaczawskie');
    expect(el.textContent).toContain('721 m n.p.m.');
    expect(el.textContent).toContain('50.94393° N, 15.88471° E');
  });

  it('shows notes in the active language', async () => {
    const fixture = await render(skopiec);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Wyższe jest Okole (PL).');

    TestBed.inject(TranslocoService).setActiveLang('en');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(el.textContent).toContain('Okole is higher (EN).');
  });

  it('hides the notes panel for undisputed peaks', async () => {
    const el = (await render({ ...skopiec, notes: null })).nativeElement as HTMLElement;

    expect(el.querySelector('mat-expansion-panel')).toBeNull();
  });

  it('emits closed when going back to the list', async () => {
    const fixture = await render(skopiec);
    let closed = false;
    fixture.componentInstance.closed.subscribe(() => (closed = true));

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('header button')!.click();

    expect(closed).toBe(true);
  });
});
