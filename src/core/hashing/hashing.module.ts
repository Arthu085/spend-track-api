import { Module } from '@nestjs/common';
import { TOKEN_HASHER } from '@shared/application/ports';
import { Sha256TokenHasher } from '@shared/infrastructure/hashing';

@Module({
  providers: [{ provide: TOKEN_HASHER, useClass: Sha256TokenHasher }],
  exports: [TOKEN_HASHER],
})
export class CoreHashingModule {}
