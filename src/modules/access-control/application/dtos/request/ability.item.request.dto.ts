import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { ActionEnum } from 'src/core/domain/enums/action.enum';
import { SubjectEnum } from 'src/core/domain/enums/subject.enum';

export class AbilityItemRequestDto {
  @ApiProperty({
    enum: ActionEnum,
    example: ActionEnum.READ,
  })
  @IsNotEmpty({ message: 'A ação é obrigatória' })
  @IsEnum(ActionEnum, { message: 'A ação deve ser um enum' })
  action: ActionEnum;

  @ApiProperty({
    enum: SubjectEnum,
    example: SubjectEnum.ROLE,
  })
  @IsNotEmpty({ message: 'O sujeito é obrigatório' })
  @IsEnum(SubjectEnum, { message: 'O sujeito deve ser um enum' })
  subject: SubjectEnum;
}
