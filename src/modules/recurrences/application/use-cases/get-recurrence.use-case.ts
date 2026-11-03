import { Injectable } from '@nestjs/common';
import { RecurrenceEntity } from '../../domain/entities/recurrence.entity';
import { RecurrenceReferences } from '../services/recurrence-references';

export interface GetRecurrenceInput {
  uuid: string;
  ownerId: number;
}

@Injectable()
export class GetRecurrenceUseCase {
  constructor(private readonly references: RecurrenceReferences) {}

  execute(input: GetRecurrenceInput): Promise<RecurrenceEntity> {
    return this.references.findRecurrence(input.uuid, input.ownerId);
  }
}
