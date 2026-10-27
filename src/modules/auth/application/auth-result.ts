import { UserEntity } from '@modules/users';

export interface AuthResult {
  user: UserEntity;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}
