import { RecordStatus } from '../../enums/record-status.enum';
import { isRecordUsable } from '../is-record-usable.policy';

describe('isRecordUsable', () => {
  it('accepts an active record that was not deleted', () => {
    expect(
      isRecordUsable({ status: RecordStatus.ACTIVE, deletedAt: null }),
    ).toBe(true);
  });

  it('refuses a missing, inactive, or deleted record', () => {
    expect(isRecordUsable(null)).toBe(false);
    expect(
      isRecordUsable({ status: RecordStatus.INACTIVE, deletedAt: null }),
    ).toBe(false);
    expect(
      isRecordUsable({ status: RecordStatus.ACTIVE, deletedAt: new Date() }),
    ).toBe(false);
  });
});
