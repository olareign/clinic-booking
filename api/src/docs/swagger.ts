import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const API_KEY_SCHEME = 'apiKey';

/**
 * Put on each controller so "Try it out" shows an X-API-Key box on every endpoint.
 * Optional because the Authorize button also sets it; if both are filled they hold the same header.
 */
export const API_KEY_HEADER_DOC = {
  name: 'X-API-Key',
  required: false,
  description: 'Your API key. Paste it here, or once for all endpoints via **Authorize** at the top. Missing or wrong: 401.',
};

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Clinic booking API')
    .setVersion('1.0')
    .setDescription(
      'Implements the Koya assessment contract (koyaacademy.com/assessment-api). ' +
        'Everything is JSON, and every error looks like `{"error": "<message>"}`.\n\n' +
        '**How to try it:**\n' +
        '1. Click **Authorize** (top right), paste your API key, click Authorize, then Close. ' +
        'Or paste the key into the **X-API-Key** box on each endpoint.\n' +
        '2. Open an endpoint, click **Try it out**, then **Execute**.\n' +
        '3. To book, first run `GET /slots` and copy a real slot `id` into `slot_id` (the sample value `s1` may not exist).\n\n' +
        'Without a valid key every endpoint returns `401`.',
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
