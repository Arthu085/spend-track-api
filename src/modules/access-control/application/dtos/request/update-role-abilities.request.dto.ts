import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsUUID } from 'class-validator';

export class UpdateRoleAbilitiesRequestDto {
  @ApiProperty({
    description: 'IDs das permissões a serem associadas à função',
    example: [1, 2, 3],
  })
  @IsArray({ message: 'Os IDs das permissões devem ser um array' })
  @IsInt({
    each: true,
    message: 'Cada ID de permissão deve ser um número inteiro',
  })
  abilityIds: number[];
}
