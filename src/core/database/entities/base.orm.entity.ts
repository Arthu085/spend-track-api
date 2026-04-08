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
  @PrimaryGeneratedColumn({ comment: 'Identificador único da entidade' })
  id: number;

  @Column({
    type: 'uuid',
    nullable: false,
    unique: true,
    default: () => 'uuid_generate_v4()',
    comment: 'Identificador único da entidade no formato UUID',
  })
  @Index()
  uuid: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    comment: 'Data de criação da entidade',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    comment: 'Data de atualização da entidade',
  })
  updatedAt: Date;

  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamptz',
    nullable: true,
    comment: 'Data de exclusão da entidade',
  })
  deletedAt: Date | null;

  @Column({
    type: 'enum',
    enum: StatusEnum,
    default: StatusEnum.ACTIVE,
    name: 'status',
    comment: 'Status da entidade',
  })
  @Index()
  status: StatusEnum;
}
