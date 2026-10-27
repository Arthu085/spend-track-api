import { ApiProperty } from '@nestjs/swagger';

export class CsrfTokenResponseDto {
  @ApiProperty({
    description:
      'The value of the csrf_token cookie set by this response. Send it in ' +
      'the X-CSRF-Token header on every POST, PUT, PATCH, and DELETE.',
    example: `${'a'.repeat(64)}.${'b'.repeat(64)}`,
  })
  csrfToken!: string;

  static fromToken(csrfToken: string): CsrfTokenResponseDto {
    const dto = new CsrfTokenResponseDto();

    dto.csrfToken = csrfToken;

    return dto;
  }
}
