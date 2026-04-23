import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  CHECK_PERMISSIONS_KEY,
  ICheckPermission,
} from '../decorators/check-permission.decorator';
import { CheckPermissionUseCase } from '../../application/use-cases/check-permission.use-case';
import { ActionEnumTranslation } from '../../domain/enums/action.enum';
import { SubjectEnumTranslation } from '../../domain/enums/subject.enum';
import { RequestWithUser } from '../../../../core/api/types/request-with-user.type';

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
      throw new ForbiddenException('Usuário não autenticado');
    }

    const missingPermissions: ICheckPermission[] = [];

    for (const permission of permissions) {
      const allowed = await this.checkPermissionUseCase.execute({
        roleUuid: user.roleUuid,
        action: permission.action,
        subject: permission.subject,
      });

      if (!allowed) {
        missingPermissions.push(permission);
      }
    }

    if (missingPermissions.length > 0) {
      throw new ForbiddenException({
        message: 'Permissões insuficientes',
        missingPermissions: this.translatePermissions(missingPermissions),
      });
    }

    return true;
  }
}
