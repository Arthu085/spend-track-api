import { ApiProperty } from '@nestjs/swagger';
import { translateOrFallback } from '@shared/presentation/http';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';
import { AbilityEntity } from '../../../domain/entities/ability.entity';

export class AbilityResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: Action })
  action!: Action;

  @ApiProperty()
  actionLabel!: string;

  @ApiProperty({ enum: Subject })
  subject!: Subject;

  @ApiProperty()
  subjectLabel!: string;

  static fromDomain(
    ability: AbilityEntity,
    translate: (key: string) => string,
  ): AbilityResponseDto {
    const dto = new AbilityResponseDto();

    dto.uuid = ability.uuid;
    dto.action = ability.action;
    dto.actionLabel = translateOrFallback(
      translate,
      `enums.action.${ability.action.toLowerCase()}`,
      ability.action,
    );
    dto.subject = ability.subject;
    dto.subjectLabel = translateOrFallback(
      translate,
      `authorization.subject_label.${ability.subject.toLowerCase()}`,
      ability.subject,
    );

    return dto;
  }
}
