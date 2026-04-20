import { Request } from 'express';
import { QueryRunner } from 'typeorm';

export interface RequestWithUser extends Request {
  user?: {
    uuid: string;
    roleUuid: string;
    email: string;
    [key: string]: unknown;
  };
  queryRunner?: QueryRunner;
}
