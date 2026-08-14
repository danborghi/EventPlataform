import {
  HttpStatus,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import helmet from 'helmet';
import { ApiExceptionFilter } from './errors/api-exception.filter.js';
import { ApiException } from './errors/api.exception.js';

type FieldErrors = Record<string, string[]>;

function collectFieldErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldErrors {
  return errors.reduce<FieldErrors>((fields, error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      fields[path] = Object.values(error.constraints);
    }

    if (error.children?.length) {
      Object.assign(fields, collectFieldErrors(error.children, path));
    }

    return fields;
  }, {});
}

export function configureApp(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      strictTransportSecurity:
        process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validationError: { target: false, value: false },
      exceptionFactory: (errors) =>
        new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Revise os campos informados.',
          { fields: collectFieldErrors(errors) },
        ),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const openApiConfig = new DocumentBuilder()
    .setTitle('Event Platform API')
    .setDescription(
      'API REST da plataforma de eventos, reservas, pagamentos e ingressos.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'bearer',
    )
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);

  SwaggerModule.setup('api/docs', app, openApiDocument, {
    jsonDocumentUrl: 'api/docs-json',
    customSiteTitle: 'Event Platform API',
  });
}
