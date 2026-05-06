import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CHECK_PERMISSIONS_KEY,
  ICheckPermission,
} from '../decorators/check-permission.decorator';
import { CheckPermissionUseCase } from '../../application/use-cases/check-permission.use-case';
import { ActionEnumTranslation } from '../../../../core/domain/enums/action.enum';
import { SubjectEnumTranslation } from '../../../../core/domain/enums/subject.enum';
import { RequestWithUser } from '../../../../core/api/types/request-with-user.type';
import { AppForbiddenException } from 'src/core/exceptions/app-forbiden.exeception';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly checkPermissionUseCase: CheckPermissionUseCase,
  ) {}

  private translatePermissions(permissions: ICheckPermission[]) {
    return permissions.map((p) => ({
      action: ActionEnumTranslation[p.action],
      subject: SubjectEnumTranslation[p.subject],
    }));
  }

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

    const missingPermissions: ICheckPermission[] = [];

    for (const permission of permissions) {
      const allowed = await this.checkPermissionUseCase.execute({
        roleUuid: user.roleUuid,
        action: permission.action,
        subject: permission.subject,
      });

      if (!allowed.allowed) {
        missingPermissions.push(permission);
      }
    }

    if (missingPermissions.length > 0) {
      throw new AppForbiddenException({
        message: 'Permissões insuficientes',
        missingPermissions: this.translatePermissions(missingPermissions),
      });
    }

    return true;
  }
}
