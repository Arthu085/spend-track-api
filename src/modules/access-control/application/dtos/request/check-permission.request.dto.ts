import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { ActionEnum } from 'src/core/domain/enums/action.enum';
import { SubjectEnum } from 'src/core/domain/enums/subject.enum';

export class CheckPermissionRequestDto {
  @ApiProperty({
    description: 'UUID da função',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty({ message: 'O UUID da função é obrigatório' })
  @IsUUID('4', { message: 'O UUID da função deve ser um UUID válido' })
  roleUuid!: string;

  @ApiProperty({
    description: 'Ação a ser verificada',
    enum: ActionEnum,
    example: ActionEnum.CREATE,
  })
  @IsEnum(ActionEnum, {
    message: 'A ação deve ser um enum',
  })
  action!: ActionEnum;

  @ApiProperty({
    description: 'Sujeito da permissão',
    enum: SubjectEnum,
    example: SubjectEnum.ROLE,
  })
  @IsEnum(SubjectEnum, {
    message: 'O sujeito deve ser um enum',
  })
  subject!: SubjectEnum;
}
