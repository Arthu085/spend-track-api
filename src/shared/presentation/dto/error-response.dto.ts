import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Subject } from '../../domain/authorization/subject';
import { Action } from '../../domain/enums/action.enum';
import type {
  ErrorResponseBody,
  RequiredAbilityView,
} from '../http/error-response.type';

export class RequiredAbilityDto implements RequiredAbilityView {
  @ApiProperty({ enum: Action })
  action!: Action;

  @ApiProperty()
  actionLabel!: string;

  @ApiProperty({ enum: Subject })
  subject!: string;

  @ApiProperty()
  subjectLabel!: string;
}

export class ErrorResponseDto implements ErrorResponseBody {
  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: 'Forbidden' })
  error!: string;

  @ApiProperty({ description: 'Localized error message.' })
  message!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: '/api/users' })
  path!: string;

  @ApiPropertyOptional({
    type: [RequiredAbilityDto],
    description: 'Present only when a required ability is missing (403).',
  })
  requiredAbilities?: RequiredAbilityDto[];

  @ApiPropertyOptional({
    description:
      'Audit reference, present only on an unexpected 500 of an audited route.',
  })
  auditId?: string;
}
