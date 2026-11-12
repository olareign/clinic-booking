import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';
import specJson from './fixtures/assessment-spec.json';

/*
 * Compares our generated OpenAPI document (served at /openapi.json) with the official
 * assessment spec saved in fixtures/assessment-spec.json: same endpoints, same documented
 * status codes, same parameters, same field names on the shared schemas, same auth header.
 * Runtime behaviour is covered separately by app.e2e-spec.ts.
 */

interface Schema {
  required?: string[];
  properties?: Record<string, unknown>;
  allOf?: (Schema & { $ref?: string })[];
}
interface Parameter {
  name: string;
  in: string;
}
interface Operation {
  responses: Record<string, unknown>;
  parameters?: Parameter[];
}
interface OpenApiDoc {
  paths: Record<string, Record<string, unknown>>;
  components: {
    schemas: Record<string, Schema>;
    securitySchemes?: Record<string, { in: string; name: string }>;
  };
  security?: unknown;
}

const spec = specJson as unknown as OpenApiDoc;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// Spec schema name -> our schema class name.
const SCHEMA_MAP: Record<string, string> = {
  Slot: 'SlotSchema',
  SlotWithAvailability: 'SlotWithAvailabilitySchema',
  NewBooking: 'NewBookingSchema',
  Booking: 'BookingSchema',
  Error: 'ErrorSchema',
};

/** Field names of a schema, following allOf and $ref (the spec uses one level of each). */
function fields(doc: OpenApiDoc, schema: Schema): string[] {
  const own = Object.keys(schema.properties ?? {});
  const inherited = (schema.allOf ?? []).flatMap((part) =>
    part.$ref ? fields(doc, doc.components.schemas[part.$ref.split('/').pop()!]) : fields(doc, part),
  );
  return [...new Set([...own, ...inherited])].sort();
}

/** Required fields of a schema, following allOf and $ref. */
function required(doc: OpenApiDoc, schema: Schema): string[] {
  const inherited = (schema.allOf ?? []).flatMap((part) =>
    part.$ref ? required(doc, doc.components.schemas[part.$ref.split('/').pop()!]) : required(doc, part),
  );
  return [...new Set([...(schema.required ?? []), ...inherited])].sort();
}

const operations = (doc: OpenApiDoc) =>
  Object.entries(doc.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => m in item).map((method) => ({
      label: `${method.toUpperCase()} ${path}`,
      path,
      method,
      op: item[method] as Operation,
      shared: (item.parameters ?? []) as Parameter[],
    })),
  );

let app: INestApplication;
let ours: OpenApiDoc;

beforeAll(async () => {
  app = await createApp({
    port: 0,
    apiKey: 'test-key-0123456789abcdef',
    databaseUrl: 'postgresql://postgres:postgres@localhost:54329/postgres',
  });
  await app.init();
  // No API key on purpose: the docs are public, the endpoints they describe are not.
  ours = (await request(app.getHttpServer()).get('/openapi.json').expect(200)).body;
});

afterAll(async () => {
  await app.close();
});

describe('OpenAPI document matches the assessment spec', () => {
  it('serves Swagger UI at /docs without an API key', async () => {
    const res = await request(app.getHttpServer()).get('/docs').expect(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('documents exactly the spec’s endpoints', () => {
    const list = (doc: OpenApiDoc) => operations(doc).map((o) => o.label).sort();
    expect(list(ours)).toEqual(list(spec));
  });

  it.each(operations(spec).map((o) => [o.label, o] as const))(
    '%s documents every status code and parameter in the spec',
    (_label, { path, method, op, shared }) => {
      const mine = ours.paths[path][method] as Operation;
      for (const code of Object.keys(op.responses)) expect(Object.keys(mine.responses)).toContain(code);
      const key = (p: Parameter) => `${p.in}:${p.name.toLowerCase()}`;
      const mineParams = [...((ours.paths[path].parameters ?? []) as Parameter[]), ...(mine.parameters ?? [])].map(key);
      for (const p of [...shared, ...(op.parameters ?? [])]) expect(mineParams).toContain(key(p));
    },
  );

  it.each(Object.entries(SCHEMA_MAP))('schema %s has the same fields and required fields', (specName, ourName) => {
    const theirs = spec.components.schemas[specName];
    const mine = ours.components.schemas[ourName];
    expect(fields(ours, mine)).toEqual(fields(spec, theirs));
    expect(required(ours, mine)).toEqual(required(spec, theirs));
  });

  it('requires the X-API-Key header on every endpoint', () => {
    expect(ours.components.securitySchemes?.apiKey).toMatchObject({ in: 'header', name: 'X-API-Key' });
    expect(ours.security).toEqual([{ apiKey: [] }]);
  });
});
