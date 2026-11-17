import { Injectable } from '@angular/core';
import { NativeDateAdapter } from '@angular/material/core';

/**
 * Native adapter that also understands the Polish `dd.mm.yyyy` the user types (and the
 * `dd/mm/yyyy` of en-GB), which `Date.parse` doesn't.
 */
@Injectable()
export class KgpDateAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: unknown): Date | null {
    if (typeof value === 'string') {
      const match = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(value);
      if (match) {
        const [, d, m, y] = match.map(Number);
        const date = new Date(y, m - 1, d);
        return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : this.invalid();
      }
    }
    return super.parse(value, parseFormat);
  }

  override getFirstDayOfWeek(): number {
    return 1;
  }
}
