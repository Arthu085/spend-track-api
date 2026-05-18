import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError, concatMap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { TRANSACTIONAL_KEY } from '../decorators/transactional.decorator';
import { RequestWithUser } from '../api/types/request-with-user.type';

@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    request.queryRunner = queryRunner;

    return next.handle().pipe(
      concatMap(async (data: unknown) => {
        if (queryRunner.isTransactionActive) {
          await queryRunner.commitTransaction();
        }
        if (!queryRunner.isReleased) {
          await queryRunner.release();
        }
        return data;
      }),
      catchError(async (error) => {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        if (!queryRunner.isReleased) {
          await queryRunner.release();
        }
        throw error;
      }),
    );
  }
}
