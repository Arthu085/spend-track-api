import { IsArray, IsInt, ArrayNotEmpty } from 'class-validator';

export class UpdateRoleAbilitiesRequestDto {
  @IsArray({ message: 'Os IDs das habilidades devem ser um array' })
  @IsInt({
    each: true,
    message: 'Cada ID de habilidade deve ser um número inteiro',
  })
  abilityIds: number[];
}
