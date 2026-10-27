import { ApiProperty } from '@nestjs/swagger';

export class HealthStatusResponseDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';

  static ok(): HealthStatusResponseDto {
    const dto = new HealthStatusResponseDto();

    dto.status = 'ok';

    return dto;
  }
}
