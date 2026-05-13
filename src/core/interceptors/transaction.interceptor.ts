import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import AppDataSource from '../database/data-source';
import { TRANSACTIONAL_KEY } from '../decorators/transactional.decorator';
import { RequestWithUser } from '../api/types/request-with-user.type';

@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const isTransactional = this.reflector.get<boolean>(
      TRANSACTIONAL_KEY,
      context.getHandler(),
    );

    if (!isTransactional) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    request.queryRunner = queryRunner;

    return next.handle().pipe(
      concatMap(async (data: unknown) => {
        await queryRunner.commitTransaction();
        try {
          await queryRunner.release();
        } catch (releaseError) {
          void releaseError;
        }
        return data;
      }),
      catchError(async (error) => {
        try {
          await queryRunner.rollbackTransaction();
        } catch (rollbackError) {
          void rollbackError;
        } finally {
          try {
            await queryRunner.release();
          } catch (releaseError) {
            void releaseError;
          }
        }
        throw error;
      }),
    );
  }
}
