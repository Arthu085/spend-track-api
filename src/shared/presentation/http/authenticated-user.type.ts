import type { Request } from 'express';

export interface AuthenticatedUser {
  id: number;
  uuid: string;
  email: string;
  name: string;
  roles: string[];
}

export interface RequestWithActor extends Request {
  user?: AuthenticatedUser;
}
