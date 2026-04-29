import {
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Type,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiResponseOptions,
  getSchemaPath,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { EndpointMethod } from '../enums/endpoint-method.enum';
import { Transactional } from '../../decorators/transactional.decorator';
import { ResponseMessage } from '../../decorators/response-message.decorator';
import { PermissionGuard } from 'src/modules/access-control/presentation/guards/permission.guard';
import { JwtAuthGuard } from 'src/modules/auth/presentation/guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from 'src/modules/auth/presentation/guards/jwt-refresh-auth.guard';

export interface IEndpointResponse {
  status: number;
  description: string;
  responseType?: Type<unknown>;
}

type AuthType = 'none' | 'access' | 'refresh';

export interface IEndpointData {
  url: string;
  description: string;
  responseMessage?: string;
  dtoName?: string;
  responses: IEndpointResponse[];
  isTransactional?: boolean;
  authType?: AuthType;
  requirePermission?: boolean;
}

interface IEndpointBaseData extends IEndpointData {
  type: EndpointMethod;
}

export class Endpoint {
  private static base({
    type,
    url,
    description,
    responseMessage,
    dtoName,
    responses,
    isTransactional = false,
    authType = 'none',
    requirePermission = false,
  }: IEndpointBaseData) {
    const decorators: Array<MethodDecorator | ClassDecorator> = [
      this.defineMethod(type, url),
      ...this.defineResponses(responses, authType, !!dtoName),
      ApiOperation({
        summary: description,
        description: this.createDescription(description, dtoName, authType),
      }),
    ];

    if (authType === 'access') {
      decorators.push(UseGuards(JwtAuthGuard));

      if (requirePermission) {
        decorators.push(UseGuards(PermissionGuard));
      }

      decorators.push(ApiCookieAuth('token'));
    }

    if (authType === 'refresh') {
      decorators.push(UseGuards(JwtRefreshAuthGuard));
      decorators.push(ApiCookieAuth('refreshToken'));
    }

    if (isTransactional) {
      decorators.push(Transactional());
    }

    if (responseMessage) {
      decorators.push(ResponseMessage(responseMessage));
    }

    return applyDecorators(...decorators);
  }

  private static defineMethod(type: EndpointMethod, url: string) {
    switch (type) {
      case EndpointMethod.GET:
        return Get(url);
      case EndpointMethod.POST:
        return Post(url);
      case EndpointMethod.PATCH:
        return Patch(url);
      case EndpointMethod.PUT:
        return Put(url);
      case EndpointMethod.DELETE:
        return Delete(url);
      default:
        throw new Error(`Método HTTP desconhecido: ${String(type)}`);
    }
  }

  private static defineResponses(
    responses: IEndpointResponse[],
    authType: AuthType,
    haveDto: boolean,
  ) {
    const allResponses = [...responses];

    allResponses.push({
      status: 500,
      description: 'Erro interno no servidor',
    });

    if (authType !== 'none') {
      allResponses.push({
        status: 401,
        description: 'Autenticação necessária para acessar este endpoint',
      });
    }

    if (haveDto) {
      allResponses.push({
        status: 400,
        description: 'Dados inválidos no DTO',
      });
    }

    return allResponses.map(({ status, description, responseType }) => {
      const apiResponseObj: ApiResponseOptions = {
        status: status,
        description: description,
        ...(responseType && {
          schema: {
            $ref: getSchemaPath(responseType),
          },
        }),
      };

      const decoratorList: (MethodDecorator | ClassDecorator)[] = [
        ApiResponse(apiResponseObj),
      ];

      if (responseType) {
        decoratorList.push(ApiExtraModels(responseType));
      }

      return applyDecorators(...decoratorList);
    });
  }

  private static createDescription(
    description: string,
    dtoName?: string,
    authType?: AuthType,
  ): string {
    let fullDescription = description;

    if (dtoName) {
      fullDescription += `\n\n**DTO:** ${dtoName}`;
    }

    if (authType === 'access') {
      fullDescription += `\n\n**Requer Access Token (cookie)**`;
    }

    if (authType === 'refresh') {
      fullDescription += `\n\n**Requer Refresh Token (cookie)**`;
    }

    return fullDescription;
  }

  public static get(data: IEndpointData) {
    return this.base({ type: EndpointMethod.GET, ...data });
  }

  public static post(data: IEndpointData) {
    return this.base({ type: EndpointMethod.POST, ...data });
  }

  public static patch(data: IEndpointData) {
    return this.base({ type: EndpointMethod.PATCH, ...data });
  }

  public static put(data: IEndpointData) {
    return this.base({ type: EndpointMethod.PUT, ...data });
  }

  public static delete(data: IEndpointData) {
    return this.base({ type: EndpointMethod.DELETE, ...data });
  }
}
