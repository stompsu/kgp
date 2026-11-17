import { TestBed } from '@angular/core/testing';
import { PeakListComponent } from './peak-list';
import { Peak } from './peak';
import { getTranslocoModule } from '../testing/transloco-testing';

const peak = (number: number, slug: string, name: string): Peak => ({
  number, slug, name, range: 'Pasmo', heightMeters: 1000 + number, latitude: 50, longitude: 20, notes: null, sources: [],
});
const peaks = [peak(1, 'lysica', 'Łysica'), peak(2, 'skrzyczne', 'Skrzyczne'), peak(28, 'rysy', 'Rysy')];

describe('PeakListComponent', () => {
  async function render(tracking: boolean, conquered = new Set<string>()) {
    await TestBed.configureTestingModule({ imports: [PeakListComponent, getTranslocoModule()] }).compileComponents();
    const fixture = TestBed.createComponent(PeakListComponent);
    fixture.componentRef.setInput('peaks', peaks);
    fixture.componentRef.setInput('tracking', tracking);
    fixture.componentRef.setInput('conquered', conquered);
    await fixture.whenStable();
    return fixture;
  }

  const names = (el: HTMLElement) => [...el.querySelectorAll('[matListItemTitle]')].map((e) => e.textContent!.trim());

  it('shows no counter or filter for guests', async () => {
    const el = (await render(false)).nativeElement as HTMLElement;

    expect(el.querySelector('.progress')).toBeNull();
    expect(el.querySelector('.filter')).toBeNull();
    expect(names(el)).toHaveLength(3);
  });

  it('counts conquered peaks out of 28 and labels them in text, not only by colour', async () => {
    const el = (await render(true, new Set(['rysy', 'lysica']))).nativeElement as HTMLElement;
    const progress = el.querySelector('.progress')!;

    expect(progress.textContent?.trim()).toBe('2 / 28');
    expect(progress.getAttribute('aria-label')).toBe('Zdobyte szczyty: 2 z 28');
    expect(names(el)).toEqual(['Łysica (zdobyty)', 'Skrzyczne', 'Rysy (zdobyty)']);
    expect(el.querySelectorAll('mat-icon.check')).toHaveLength(2);
  });

  it('filters conquered and remaining peaks', async () => {
    const fixture = await render(true, new Set(['rysy']));
    const el = fixture.nativeElement as HTMLElement;
    const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('.filter button')].find((b) => b.textContent?.includes(label))!;

    button('Zdobyte').click();
    await fixture.whenStable();
    expect(names(el)).toEqual(['Rysy (zdobyty)']);
    expect(button('Zdobyte').getAttribute('aria-pressed')).toBe('true');

    button('Do zdobycia').click();
    await fixture.whenStable();
    expect(names(el)).toEqual(['Łysica', 'Skrzyczne']);
  });
});
