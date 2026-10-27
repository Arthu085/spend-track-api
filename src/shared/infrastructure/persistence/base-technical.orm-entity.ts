import { Column, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';

export abstract class BaseTechnicalOrmEntity {
  @PrimaryGeneratedColumn('increment', {
    name: 'id',
    comment:
      'Surrogate auto-incrementing primary key; internal use only, never exposed over HTTP.',
  })
  id!: number;

  @Column({
    name: 'uuid',
    type: 'uuid',
    generated: 'uuid',
    unique: true,
    nullable: false,
    comment: 'Public identifier exposed to clients instead of the numeric id.',
  })
  uuid!: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    nullable: false,
    comment: 'Timestamp when the record was created.',
  })
  createdAt!: Date;
}
