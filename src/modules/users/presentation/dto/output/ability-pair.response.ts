import { ApiProperty } from '@nestjs/swagger';
import type { AbilityPair } from '@shared/domain/authorization/ability-pair.type';
import { Subject } from '@shared/domain/authorization/subject';
import { Action } from '@shared/domain/enums/action.enum';

export class AbilityPairResponseDto {
  @ApiProperty({ enum: Action })
  action!: Action;

  @ApiProperty({ enum: Subject })
  subject!: Subject;

  static fromDomain(pair: AbilityPair): AbilityPairResponseDto {
    const dto = new AbilityPairResponseDto();

    dto.action = pair.action;
    dto.subject = pair.subject;

    return dto;
  }
}
