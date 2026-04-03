import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Generated,
} from 'typeorm';

@Entity('seed_history', {
  comment: 'Table for storing the history of executed seeds',
})
export class SeedHistoryOrmEntity {
  @PrimaryGeneratedColumn({
    comment: 'Unique identifier of the seed history record',
  })
  id: number;

  @Generated('uuid')
  @Column({
    type: 'uuid',
    name: 'uuid',
    nullable: false,
    unique: true,
    comment: 'Unique identifier of the entity in UUID format',
  })
  uuid: string;

  @Column({ unique: true, comment: 'Name of the executed seed' })
  name: string;

  @CreateDateColumn({
    name: 'executed_at',
    type: 'timestamptz',
    comment: 'Date of execution of the seed',
  })
  executedAt: Date;
}
