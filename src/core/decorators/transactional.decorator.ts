import { SetMetadata } from '@nestjs/common';

export const TRANSACTIONAL_KEY = 'isTransactional';

export const Transactional = () => SetMetadata(TRANSACTIONAL_KEY, true);
