import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { AbilityItemRequestDto } from './ability.item.request.dto';

export class UpdateRoleAbilitiesRequestDto {
  @ApiProperty({
    type: [AbilityItemRequestDto],
    description: 'Lista de permissões da função',
  })
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => AbilityItemRequestDto)
  abilities!: AbilityItemRequestDto[];
}
