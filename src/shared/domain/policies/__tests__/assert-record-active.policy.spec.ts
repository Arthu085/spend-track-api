import { ConflictError } from '../../errors/conflict.error';
import { DomainError } from '../../errors/domain-error';
import { RecordStatus } from '../../enums/record-status.enum';
import { assertRecordActive } from '../assert-record-active.policy';

describe('assertRecordActive', () => {
  it('does not throw when the record is ACTIVE', () => {
    const record = { status: RecordStatus.ACTIVE };
    const error = new ConflictError();

    expect(() => assertRecordActive(record, error)).not.toThrow();
  });

  it('throws the exact error instance passed in when the record is INACTIVE', () => {
    const record = { status: RecordStatus.INACTIVE };
    const error: DomainError = new ConflictError('some.key');

    expect(() => assertRecordActive(record, error)).toThrow(error);

    try {
      assertRecordActive(record, error);
      throw new Error('expected assertRecordActive to throw');
    } catch (thrown) {
      expect(thrown).toBe(error);
    }
  });
});
