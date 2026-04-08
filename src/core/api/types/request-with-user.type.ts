import { Request } from 'express';
import { QueryRunner } from 'typeorm';

export type RequestWithUser = Request & {
  // user?
  queryRunner?: QueryRunner;
};
