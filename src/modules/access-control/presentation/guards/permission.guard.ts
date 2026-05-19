import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CHECK_PERMISSIONS_KEY,
  ICheckPermission,
} from '../decorators/check-permission.decorator';
import { CheckPermissionUseCase } from '../../application/use-cases/check-permission.use-case';
import { RequestWithUser } from '../../../../core/api/types/request-with-user.type';
import { AppForbiddenException } from 'src/core/exceptions/app-forbiden.exception';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly checkPermissionUseCase: CheckPermissionUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions = this.reflector.get<ICheckPermission[]>(
      CHECK_PERMISSIONS_KEY,
      context.getHandler(),
    );

    if (!permissions || permissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new AppForbiddenException({ message: 'Usuário não autenticado' });
    }

    const { allowed, missingPermissions } =
      await this.checkPermissionUseCase.execute({
        roleUuid: user.roleUuid,
        permissions: permissions,
      });

    if (!allowed && missingPermissions.length > 0) {
      throw new AppForbiddenException({
        message: 'Permissões insuficientes para acessar recurso',
        missingPermissions,
      });
    }

    return true;
  }
}
