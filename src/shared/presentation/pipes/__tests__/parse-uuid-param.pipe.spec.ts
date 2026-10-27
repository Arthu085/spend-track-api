import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import type { I18nService } from 'nestjs-i18n';
import { ParseUuidParamPipe } from '../parse-uuid-param.pipe';

// Bare `@Param('uuid')` bindings have no metatype for the global validation
// pipe, so without this pipe an invalid uuid reaches TypeORM and surfaces as a
// 500 instead of a translated 400.
describe('ParseUuidParamPipe', () => {
  const metadataFor = (paramName: string): ArgumentMetadata => ({
    type: 'param',
    data: paramName,
  });

  const createI18n = (translated = 'translated message') => {
    const translate = jest.fn().mockReturnValue(translated);
    const service = { translate } as unknown as I18nService;

    return { service, translate };
  };

  it('returns the value unchanged when it is a valid UUID', () => {
    const { service, translate } = createI18n();
    const pipe = new ParseUuidParamPipe(service);
    const validUuid = '3c1b8e2e-2f0a-4b8b-9a4b-6a5e1d2c3f4a';

    const result = pipe.transform(validUuid, metadataFor('uuid'));

    expect(result).toBe(validUuid);
    expect(translate).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for a malformed value, translating validation.IS_UUID with the interpolated param name', () => {
    const { service, translate } = createI18n(
      'O campo uuid deve ser um UUID válido',
    );

    const pipe = new ParseUuidParamPipe(service);

    expect(() => pipe.transform('not-a-uuid', metadataFor('uuid'))).toThrow(
      BadRequestException,
    );

    expect(translate).toHaveBeenCalledWith(
      'validation.IS_UUID',
      expect.objectContaining({ args: { property: 'uuid' } }),
    );
  });

  it('throws BadRequestException with the translated message as the exception message', () => {
    const { service } = createI18n('O campo uuid deve ser um UUID válido');
    const pipe = new ParseUuidParamPipe(service);

    try {
      pipe.transform('not-a-uuid', metadataFor('uuid'));
      throw new Error('expected pipe.transform to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).message).toBe(
        'O campo uuid deve ser um UUID válido',
      );
    }
  });

  it('rejects an empty string', () => {
    const { service, translate } = createI18n();
    const pipe = new ParseUuidParamPipe(service);

    expect(() => pipe.transform('', metadataFor('uuid'))).toThrow(
      BadRequestException,
    );
    expect(translate).toHaveBeenCalledWith(
      'validation.IS_UUID',
      expect.objectContaining({ args: { property: 'uuid' } }),
    );
  });

  it('interpolates the actual param name from ArgumentMetadata.data, not a hardcoded "uuid"', () => {
    const { service, translate } = createI18n();
    const pipe = new ParseUuidParamPipe(service);

    expect(() => pipe.transform('not-a-uuid', metadataFor('roleUuid'))).toThrow(
      BadRequestException,
    );

    expect(translate).toHaveBeenCalledWith(
      'validation.IS_UUID',
      expect.objectContaining({ args: { property: 'roleUuid' } }),
    );
  });
});
