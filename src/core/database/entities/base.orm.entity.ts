import { StatusEnum } from 'src/core/domain/enums/status.enum';
import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Column,
  Index,
  Generated,
} from 'typeorm';

export abstract class BaseOrmEntity {
  @PrimaryGeneratedColumn({ comment: 'Unique identifier of the entity' })
  id: number;

  @Generated('uuid')
  @Column({
    type: 'uuid',
    name: 'uuid',
    nullable: false,
    unique: true,
    comment: 'Unique identifier of the entity in UUID format',
  })
  @Index()
  uuid: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    comment: 'Date of creation of the entity',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'Date of update of the entity',
  })
  updatedAt: Date | null;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'Date of deletion of the entity',
  })
  deletedAt: Date | null;

  @Column({
    type: 'enum',
    enum: StatusEnum,
    default: StatusEnum.ACTIVE,
    name: 'status',
    comment: 'Status of the entity',
  })
  @Index()
  status: StatusEnum;
}
