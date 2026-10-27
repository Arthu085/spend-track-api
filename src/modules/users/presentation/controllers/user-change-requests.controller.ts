import { Body, Controller, HttpStatus, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from '@core/config';
import { clearAuthCookies } from '@modules/auth/presentation';
import { Action } from '@shared/domain/enums/action.enum';
import { Subject } from '@shared/domain/authorization/subject';
import { endpoint } from '@shared/presentation/builders';
import {
  CurrentActor,
  Translator,
  type Translate,
} from '@shared/presentation/decorators';
import type { AuthenticatedUser } from '@shared/presentation/http';
import { ParseUuidParamPipe } from '@shared/presentation/pipes';
import { ApproveUserChangeRequestUseCase } from '../../application/use-cases/approve-user-change-request.use-case';
import { ListMyUserChangeRequestsUseCase } from '../../application/use-cases/list-my-user-change-requests.use-case';
import { RejectUserChangeRequestUseCase } from '../../application/use-cases/reject-user-change-request.use-case';
import { RequestUserChangeUseCase } from '../../application/use-cases/request-user-change.use-case';
import { UpdateUserDto } from '../dto/input/update-user.dto';
import { UserChangeRequestResponseDto } from '../dto/output/user-change-request.response';
import { UserDetailResponseDto } from '../dto/output/user-detail.response';

@Controller('users')
export class UserChangeRequestsController {
  constructor(
    private readonly listMyChangeRequests: ListMyUserChangeRequestsUseCase,
    private readonly requestUserChange: RequestUserChangeUseCase,
    private readonly approveChangeRequest: ApproveUserChangeRequestUseCase,
    private readonly rejectChangeRequest: RejectUserChangeRequestUseCase,
    private readonly config: AppConfigService,
  ) {}

  @(endpoint()
    .get('me/change-requests')
    .successMessage('success.ok')
    .tags('users')
    .summary('List pending change requests awaiting your approval')
    .description(
      'Each request shows the profile values when it was made and the values it would apply. Only users holding ADMIN receive change requests.',
    )
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'Only users holding ADMIN receive change requests.',
    )
    .response(UserChangeRequestResponseDto, undefined, { isArray: true })
    .build())
  async findMyChangeRequests(
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<UserChangeRequestResponseDto[]> {
    const requests = await this.listMyChangeRequests.execute(actor.id);

    return requests.map((request) =>
      UserChangeRequestResponseDto.fromDomain(request, translate),
    );
  }

  @(endpoint()
    .post(':uuid/change-requests')
    .httpCode(HttpStatus.CREATED)
    .ability({ action: Action.UPDATE, subject: Subject.USER })
    .ability({ action: Action.READ, subject: Subject.USER })
    .audit('User.request_change')
    .successMessage('success.created')
    .tags('users')
    .summary("Request a change to another admin's profile")
    .description(
      'The change is applied only if the target admin approves it before it expires. A new request supersedes any pending one. ADMIN cannot be removed.',
    )
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'Only an active admin can modify an admin, or the ADMIN role cannot be removed.',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'User or role not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Email already in use, user or role inactive, or the target is not another admin.',
    )
    .body(UpdateUserDto)
    .response(UserChangeRequestResponseDto, HttpStatus.CREATED)
    .build())
  async createChangeRequest(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @Body() dto: UpdateUserDto,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
  ): Promise<UserChangeRequestResponseDto> {
    const request = await this.requestUserChange.execute({
      uuid,
      name: dto.name,
      email: dto.email,
      roleUuids: dto.roleUuids,
      actorId: actor.id,
    });

    return UserChangeRequestResponseDto.fromDomain(request, translate);
  }

  @(endpoint()
    .post('me/change-requests/:uuid/approve')
    .httpCode(HttpStatus.OK)
    .audit('User.approve_change')
    .successMessage('success.updated')
    .tags('users')
    .summary('Approve a pending change request to your profile')
    .description(
      'Applying the change revokes all of your sessions and clears the auth cookies, so you must log in again. If the email changed, it must be confirmed first.',
    )
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'Only users holding ADMIN receive change requests.',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Change request or role not found.')
    .errorResponse(
      HttpStatus.CONFLICT,
      'Request no longer pending or outdated, email already in use, or user or role inactive.',
    )
    .response(UserDetailResponseDto)
    .build())
  async approveMyChangeRequest(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
    @Translator() translate: Translate,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDetailResponseDto> {
    const user = await this.approveChangeRequest.execute({
      uuid,
      actorId: actor.id,
    });

    clearAuthCookies(res, this.config.cookie);

    return UserDetailResponseDto.fromDomain(user, translate);
  }

  @(endpoint()
    .post('me/change-requests/:uuid/reject')
    .httpCode(HttpStatus.OK)
    .audit('User.reject_change')
    .successMessage('users.success.change_request_rejected')
    .tags('users')
    .summary('Reject a pending change request to your profile')
    .errorResponse(
      HttpStatus.FORBIDDEN,
      'Only users holding ADMIN receive change requests.',
    )
    .errorResponse(HttpStatus.NOT_FOUND, 'Change request not found.')
    .errorResponse(HttpStatus.CONFLICT, 'Request no longer pending.')
    .build())
  async rejectMyChangeRequest(
    @Param('uuid', ParseUuidParamPipe) uuid: string,
    @CurrentActor() actor: AuthenticatedUser,
  ): Promise<null> {
    await this.rejectChangeRequest.execute({ uuid, actorId: actor.id });

    return null;
  }
}
