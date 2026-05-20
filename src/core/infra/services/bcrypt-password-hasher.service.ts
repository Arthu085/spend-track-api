import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { IPasswordHasher } from 'src/core/domain/services/password-hasher.interface';

@Injectable()
export class BcryptPasswordHasher implements IPasswordHasher {
  async hash(plain: string, rounds = 12): Promise<string> {
    return bcrypt.hash(plain, rounds);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
