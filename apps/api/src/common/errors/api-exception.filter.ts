import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@event-platform/contracts';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiException } from './api.exception.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = `req_${randomUUID().replaceAll('-', '')}`;
    const error = this.toPublicError(exception, status, requestId);

    response.setHeader('X-Request-Id', requestId);
    response.status(status).json(error);

    if (status >= 500) {
      console.error({
        requestId,
        method: request.method,
        path: request.path,
        error: exception instanceof Error ? exception.message : 'Unknown error',
      });
    }
  }

  private toPublicError(
    exception: unknown,
    status: number,
    requestId: string,
  ): ApiErrorResponse {
    if (exception instanceof ApiException) {
      return {
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          requestId,
        },
      };
    }

    const defaults = this.defaultError(status);

    return {
      error: {
        ...defaults,
        details: {},
        requestId,
      },
    };
  }

  private defaultError(status: number): { code: string; message: string } {
    if (status === 400) {
      return {
        code: 'VALIDATION_ERROR',
        message: 'Revise os campos informados.',
      };
    }

    if (status === 401) {
      return {
        code: 'UNAUTHENTICATED',
        message: 'Autenticação necessária.',
      };
    }

    if (status === 403) {
      return {
        code: 'FORBIDDEN',
        message: 'Você não tem permissão para executar esta ação.',
      };
    }

    if (status === 429) {
      return {
        code: 'RATE_LIMITED',
        message: 'Muitas tentativas. Aguarde antes de tentar novamente.',
      };
    }

    return {
      code: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir a solicitação.',
    };
  }
}
