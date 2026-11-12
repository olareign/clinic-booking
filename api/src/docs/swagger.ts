import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const API_KEY_SCHEME = 'apiKey';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Clinic booking API')
    .setVersion('1.0')
    .setDescription(
      'Implements the Koya assessment contract (koyaacademy.com/assessment-api). ' +
        'Everything is JSON, and every error looks like `{"error": "<message>"}`. ' +
        'Every endpoint needs the `X-API-Key` header: click **Authorize** and paste your key to use "Try it out".',
    )
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, API_KEY_SCHEME)
    .addSecurityRequirements(API_KEY_SCHEME)
    .build();
  return SwaggerModule.createDocument(app, config);
}

/**
 * Serves Swagger UI at /docs and the raw document at /openapi.json.
 * These are mounted directly on the HTTP server (not Nest controllers), so the API-key
 * guard doesn't apply: the docs are readable, but every "Try it out" call still needs the key.
 */
export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup('docs', app, () => buildOpenApiDocument(app), {
    jsonDocumentUrl: 'openapi.json',
    customSiteTitle: 'Clinic booking API docs',
    swaggerOptions: { persistAuthorization: true },
  });
}
