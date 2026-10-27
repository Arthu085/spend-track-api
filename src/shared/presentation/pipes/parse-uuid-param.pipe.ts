import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class ParseUuidParamPipe implements PipeTransform<string, string> {
  constructor(private readonly i18n: I18nService) {}

  transform(value: string, metadata: ArgumentMetadata): string {
    if (isUUID(value)) {
      return value;
    }

    const property = metadata.data ?? 'uuid';

    const message: string = this.i18n.translate('validation.IS_UUID', {
      args: { property },
    });

    throw new BadRequestException(message);
  }
}
