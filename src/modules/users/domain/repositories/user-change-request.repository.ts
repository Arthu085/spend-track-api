import { UserChangeRequestEntity } from '../entities/user-change-request.entity';

export const USER_CHANGE_REQUEST_REPOSITORY = Symbol(
  'USER_CHANGE_REQUEST_REPOSITORY',
);

export interface UserChangeRequestRepository {
  create(request: UserChangeRequestEntity): Promise<UserChangeRequestEntity>;
  findByUuid(uuid: string): Promise<UserChangeRequestEntity | null>;
  findPendingForUser(
    targetUserId: number,
    now: Date,
  ): Promise<UserChangeRequestEntity[]>;
  saveDecision(request: UserChangeRequestEntity): Promise<void>;
  supersedePendingForUser(targetUserId: number): Promise<void>;
  supersedePendingInvolving(userId: number): Promise<void>;
}
