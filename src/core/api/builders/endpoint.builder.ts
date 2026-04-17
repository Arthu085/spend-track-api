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
  getSchemaPath,
} from '@nestjs/swagger';
import { EndpointMethod } from '../enums/endpoint-method.enum';
import { Transactional } from '../../decorators/transactional.decorator';
import { ResponseMessage } from '../../decorators/response-message.decorator';
import { PermissionGuard } from 'src/modules/access-control/presentation/guards/permission.guard';

export interface IEndpointResponse {
  status: number;
  description: string;
  responseType?: Type<unknown>;
}

export interface IEndpointData {
  url: string;
  description: string;
  responseMessage?: string;
  dtoName?: string;
  responses: IEndpointResponse[];
  isTransactional?: boolean;
  isProtected?: boolean;
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
    isProtected = false,
  }: IEndpointBaseData) {
    const decorators: Array<MethodDecorator | ClassDecorator> = [
      this.defineMethod(type, url),
      ...this.defineResponses(responses, isProtected, !!dtoName),
      ApiOperation({
        summary: description,
        description: this.createDescription(description, dtoName, isProtected),
      }),
    ];

    if (isProtected) {
      decorators.push(UseGuards(PermissionGuard));
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
        throw new Error(`Método HTTP desconhecido: ${type}`);
    }
  }

  private static defineResponses(
    responses: IEndpointResponse[],
    isProtected: boolean,
    haveDto: boolean,
  ) {
    const allResponses = [...responses];

    allResponses.push({
      status: 500,
      description: 'Erro interno no servidor',
    });

    if (isProtected) {
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
      const apiResponseObj: any = {
        status: status,
        description: description,
      };

      if (responseType) {
        apiResponseObj.schema = {
          $ref: getSchemaPath(responseType),
        };
      }

      const decoratorList: any[] = [ApiResponse(apiResponseObj)];

      if (responseType) {
        decoratorList.push(ApiExtraModels(responseType));
      }

      return applyDecorators(...decoratorList);
    });
  }

  private static createDescription(
    description: string,
    dtoName?: string,
    isProtected?: boolean,
  ): string {
    let fullDescription = description;

    if (dtoName) {
      fullDescription += `\n\n**DTO:** ${dtoName}`;
    }

    if (isProtected) {
      fullDescription += `\n\n**Requer autenticação:** Bearer token obrigatório`;
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
