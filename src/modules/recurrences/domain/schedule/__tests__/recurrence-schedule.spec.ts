import { RecurrenceFrequency } from '../../enums/recurrence-frequency.enum';
import {
  firstScheduleDateFrom,
  occurrenceDateAt,
  scheduleDates,
} from '../recurrence-schedule';

describe('recurrence schedule', () => {
  it.each([
    [RecurrenceFrequency.WEEKLY, 2, '2026-02-14'],
    [RecurrenceFrequency.MONTHLY, 1, '2026-02-28'],
    [RecurrenceFrequency.MONTHLY, 2, '2026-03-31'],
    [RecurrenceFrequency.YEARLY, 2, '2028-01-31'],
  ])(
    'computes occurrence %s #%i from the start date, clamping without drifting',
    (frequency, index, expected) => {
      expect(occurrenceDateAt('2026-01-31', frequency, index)).toBe(expected);
    },
  );

  it('lists the dates after the cursor up to the limit, inclusive', () => {
    expect(
      scheduleDates('2026-10-15', RecurrenceFrequency.MONTHLY, {
        after: '2026-11-15',
        until: '2027-02-15',
      }),
    ).toEqual(['2026-12-15', '2027-01-15', '2027-02-15']);
  });

  it('starts with the start date when nothing was generated', () => {
    expect(
      scheduleDates('2026-11-03', RecurrenceFrequency.WEEKLY, {
        after: null,
        until: '2026-11-17',
      }),
    ).toEqual(['2026-11-03', '2026-11-10', '2026-11-17']);
  });

  it('lists nothing when the limit is before the start date', () => {
    expect(
      scheduleDates('2026-11-03', RecurrenceFrequency.MONTHLY, {
        after: null,
        until: '2026-11-02',
      }),
    ).toEqual([]);
  });

  it('finds the first scheduled date on or after a date', () => {
    expect(
      firstScheduleDateFrom(
        '2026-01-31',
        RecurrenceFrequency.MONTHLY,
        '2026-03-01',
      ),
    ).toBe('2026-03-31');
    expect(
      firstScheduleDateFrom(
        '2026-10-15',
        RecurrenceFrequency.MONTHLY,
        '2026-10-15',
      ),
    ).toBe('2026-10-15');
  });
});
