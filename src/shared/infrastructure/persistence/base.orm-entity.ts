import { Column, DeleteDateColumn, UpdateDateColumn } from 'typeorm';
import { RecordStatus } from '@shared/domain/enums/record-status.enum';
import { BaseTechnicalOrmEntity } from './base-technical.orm-entity';

export abstract class BaseOrmEntity extends BaseTechnicalOrmEntity {
  @Column({
    name: 'status',
    type: 'enum',
    enum: RecordStatus,
    nullable: false,
    default: RecordStatus.ACTIVE,
    comment: 'Lifecycle status of the record.',
  })
  status!: RecordStatus;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
    comment: 'Timestamp when the record was last updated.',
  })
  updatedAt!: Date;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
    comment:
      'Timestamp when the record was soft-deleted; null while the record is active.',
  })
  deletedAt!: Date | null;
}
