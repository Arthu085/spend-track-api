export class CheckPermissionResponseDto {
  allowed: boolean;

  constructor(allowed: boolean) {
    this.allowed = allowed;
  }
}
