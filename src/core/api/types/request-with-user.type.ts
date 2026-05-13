import { Request } from 'express';
import { AuthUser } from 'src/modules/auth/domain/types/auth-user.type';
import { QueryRunner } from 'typeorm';

export interface RequestWithUser extends Request {
  user?: AuthUser;
  queryRunner?: QueryRunner;
}
