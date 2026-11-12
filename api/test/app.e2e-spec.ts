import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/main';

const API_KEY = 'test-key-0123456789abcdef';
const future = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString().replace('.000', '');

const SLOTS = [
  { id: 's2', provider: 'Dr Ade', start: future(48), end: future(48.5) },
  { id: 's1', provider: 'Dr Ade', start: future(24), end: future(24.5) },
  { id: 's3', provider: 'Dr Bisi', start: future(72), end: future(72.5) },
  { id: 's4', provider: 'Dr Bisi', start: future(96), end: future(96.5) },
  { id: 'past', provider: 'Dr Ade', start: '2020-01-01T09:00:00Z', end: '2020-01-01T09:30:00Z' },
];

let app: INestApplication;
let emailCounter = 0;
/** Unique email per call so the rate limit from one test never leaks into another. */
const uniqueEmail = () => `user${++emailCounter}@example.com`;

const api = () => {
  const agent = request(app.getHttpServer());
  return {
    get: (url: string) => agent.get(url).set('X-API-Key', API_KEY),
    post: (url: string) => agent.post(url).set('X-API-Key', API_KEY),
    delete: (url: string) => agent.delete(url).set('X-API-Key', API_KEY),
  };
};

const book = (body: object, idempotencyKey?: string) => {
  const req = api().post('/bookings').send(body);
  return idempotencyKey ? req.set('Idempotency-Key', idempotencyKey) : req;
};

beforeAll(async () => {
  app = await createApp({
    port: 0,
    apiKey: API_KEY,
    databaseUrl: 'postgresql://postgres:postgres@localhost:54329/postgres',
  });
  await app.init();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await api().post('/reset').send({ slots: SLOTS }).expect(200);
});

describe('Level 1 · slots and bookings', () => {
  it('lists every slot earliest first, with availability, echoing the dates exactly', async () => {
    const res = await api().get('/slots').expect(200);
    expect(res.body.slots.map((s: { id: string }) => s.id)).toEqual(['past', 's1', 's2', 's3', 's4']);
    expect(res.body.slots[1]).toEqual({ ...SLOTS[1], available: true });
  });

  it('filters by provider (exact match)', async () => {
    const res = await api().get('/slots?provider=Dr%20Bisi').expect(200);
    expect(res.body.slots.map((s: { id: string }) => s.id)).toEqual(['s3', 's4']);
    expect((await api().get('/slots?provider=dr%20bisi')).body.slots).toEqual([]);
  });

  it('books a slot, looks it up, and marks the slot unavailable', async () => {
    const created = await book({ slot_id: 's1', name: 'Ada Obi', email: 'ada@example.com' }).expect(201);
    expect(created.body).toMatchObject({ slot_id: 's1', name: 'Ada Obi', email: 'ada@example.com', status: 'confirmed' });
    expect(typeof created.body.id).toBe('string');
    expect(Number.isNaN(Date.parse(created.body.created_at))).toBe(false);

    const fetched = await api().get(`/bookings/${created.body.id}`).expect(200);
    expect(fetched.body).toEqual(created.body);

    const slots = await api().get('/slots').expect(200);
    expect(slots.body.slots.find((s: { id: string }) => s.id === 's1').available).toBe(false);
  });

  it('returns 404 for an unknown booking id', async () => {
    const res = await api().get('/bookings/does-not-exist').expect(404);
    expect(res.body).toEqual({ error: expect.any(String) });
  });

  it('reset deletes bookings', async () => {
    const created = await book({ slot_id: 's1', name: 'Ada', email: uniqueEmail() }).expect(201);
    await api().post('/reset').send({ slots: SLOTS }).expect(200);
    await api().get(`/bookings/${created.body.id}`).expect(404);
  });

  it('rejects a malformed reset body', async () => {
    await api().post('/reset').send({ slots: 'nope' }).expect(400);
    await api().post('/reset').send({ slots: [{ id: 'x' }] }).expect(400);
  });
});

describe('Level 2 · API key and validation', () => {
  it('returns 401 without the key or with a wrong key', async () => {
    const server = app.getHttpServer();
    const missing = await request(server).get('/slots').expect(401);
    expect(missing.body).toEqual({ error: expect.any(String) });
    await request(server).get('/slots').set('X-API-Key', 'wrong').expect(401);
    await request(server).post('/bookings').send({}).expect(401);
  });

  it.each([
    [{ name: 'Ada', email: 'a@example.com' }],
    [{ slot_id: 's1', email: 'a@example.com' }],
    [{ slot_id: 's1', name: 'Ada' }],
    [{ slot_id: '', name: 'Ada', email: 'a@example.com' }],
    [{ slot_id: 's1', name: '   ', email: 'a@example.com' }],
    [{ slot_id: 's1', name: 'Ada', email: 'not-an-email' }],
    [{ slot_id: 's1', name: 'Ada', email: 'a@b' }],
    [{ slot_id: 123, name: 'Ada', email: 'a@example.com' }],
  ])('returns 400 for missing or invalid details: %j', async (body) => {
    const res = await book({ ...body }).expect(400);
    expect(res.body).toEqual({ error: expect.any(String) });
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await api().post('/bookings').set('Content-Type', 'application/json').send('{"slot_id":').expect(400);
    expect(res.body).toEqual({ error: expect.any(String) });
  });

  it('returns 404 when the slot does not exist', async () => {
    await book({ slot_id: 'nope', name: 'Ada', email: uniqueEmail() }).expect(404);
  });

  it('returns 400 when the slot has already started', async () => {
    await book({ slot_id: 'past', name: 'Ada', email: uniqueEmail() }).expect(400);
  });

  it('trims name and email and lower-cases the email', async () => {
    const res = await book({ slot_id: 's1', name: '  Ada Obi  ', email: '  ADA.Obi@Example.COM ' }).expect(201);
    expect(res.body.name).toBe('Ada Obi');
    expect(res.body.email).toBe('ada.obi@example.com');
  });
});

describe('Level 3 · no double booking, cancellation', () => {
  it('returns 409 when the slot is already booked', async () => {
    await book({ slot_id: 's1', name: 'Ada', email: uniqueEmail() }).expect(201);
    await book({ slot_id: 's1', name: 'Bola', email: uniqueEmail() }).expect(409);
  });

  it('allows exactly one booking when many requests arrive at once', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, i) => book({ slot_id: 's2', name: `P${i}`, email: uniqueEmail() })),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(24);
  });

  it('cancels a booking, frees the slot, and rejects a second cancel', async () => {
    const created = await book({ slot_id: 's1', name: 'Ada', email: uniqueEmail() }).expect(201);

    const cancelled = await api().delete(`/bookings/${created.body.id}`).expect(200);
    expect(cancelled.body).toEqual({ ...created.body, status: 'cancelled' });
    await api().delete(`/bookings/${created.body.id}`).expect(409);

    const slot = (await api().get('/slots')).body.slots.find((s: { id: string }) => s.id === 's1');
    expect(slot.available).toBe(true);
    await book({ slot_id: 's1', name: 'Bola', email: uniqueEmail() }).expect(201);
  });

  it('returns 404 when cancelling an unknown booking', async () => {
    await api().delete('/bookings/does-not-exist').expect(404);
  });
});

describe('Level 4 · idempotency and pagination', () => {
  it('replays the same response for the same key and body, without a second booking', async () => {
    const body = { slot_id: 's1', name: 'Ada', email: uniqueEmail() };
    const first = await book(body, 'key-1').expect(201);
    const second = await book(body, 'key-1').expect(201);
    expect(second.body).toEqual(first.body);

    const list = await api().get(`/bookings?email=${body.email}`).expect(200);
    expect(list.body.bookings).toHaveLength(1);
  });

  it('replays error responses too (same status code)', async () => {
    const body = { slot_id: 'nope', name: 'Ada', email: uniqueEmail() };
    await book(body, 'key-err').expect(404);
    await book(body, 'key-err').expect(404);
  });

  it('returns 422 when the same key is reused with a different body', async () => {
    const email = uniqueEmail();
    await book({ slot_id: 's1', name: 'Ada', email }, 'key-2').expect(201);
    const res = await book({ slot_id: 's2', name: 'Ada', email }, 'key-2').expect(422);
    expect(res.body).toEqual({ error: expect.any(String) });
  });

  it('creates exactly one booking when the same request is retried concurrently', async () => {
    const body = { slot_id: 's3', name: 'Ada', email: uniqueEmail() };
    const results = await Promise.all(Array.from({ length: 10 }, () => book(body, 'key-concurrent')));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
  });

  it('pages through a person’s bookings oldest first, matching email case-insensitively', async () => {
    const email = uniqueEmail();
    const ids: string[] = [];
    for (const slot_id of ['s1', 's2', 's3']) {
      ids.push((await book({ slot_id, name: 'Ada', email }).expect(201)).body.id);
    }
    await book({ slot_id: 's4', name: 'Other', email: uniqueEmail() }).expect(201);

    const page1 = await api().get(`/bookings?email=${email.toUpperCase()}&limit=2`).expect(200);
    expect(page1.body.bookings.map((b: { id: string }) => b.id)).toEqual(ids.slice(0, 2));
    expect(typeof page1.body.next_cursor).toBe('string');

    const page2 = await api()
      .get(`/bookings?email=${email}&limit=2&cursor=${encodeURIComponent(page1.body.next_cursor)}`)
      .expect(200);
    expect(page2.body.bookings.map((b: { id: string }) => b.id)).toEqual(ids.slice(2));
    expect(page2.body.next_cursor).toBeNull();
  });

  it('defaults to 10 per page and includes cancelled bookings', async () => {
    const email = uniqueEmail();
    const created = await book({ slot_id: 's1', name: 'Ada', email }).expect(201);
    await api().delete(`/bookings/${created.body.id}`).expect(200);
    const res = await api().get(`/bookings?email=${email}`).expect(200);
    expect(res.body).toEqual({ bookings: [{ ...created.body, status: 'cancelled' }], next_cursor: null });
  });

  it.each(['0', '51', 'abc', '1.5', '-1'])('returns 400 for limit=%s', async (limit) => {
    await api().get(`/bookings?email=a@example.com&limit=${limit}`).expect(400);
  });

  it('returns 400 for a garbage cursor or a missing email', async () => {
    await api().get('/bookings?email=a@example.com&cursor=%%%').expect(400);
    await api().get('/bookings').expect(400);
  });
});

describe('Level 5 · rate limiting', () => {
  it('allows 5 attempts per email per minute (failures included), then 429 with Retry-After', async () => {
    const email = uniqueEmail();
    await book({ slot_id: 's1', name: 'Ada', email }).expect(201);
    await book({ slot_id: 's1', name: 'Ada', email }).expect(409);
    await book({ slot_id: 'nope', name: 'Ada', email }).expect(404);
    await book({ slot_id: 'past', name: 'Ada', email }).expect(400);
    await book({ slot_id: 's2', name: '', email }).expect(400);

    const blocked = await book({ slot_id: 's3', name: 'Ada', email }).expect(429);
    expect(blocked.body).toEqual({ error: expect.any(String) });
    const retryAfter = blocked.headers['retry-after'];
    expect(retryAfter).toMatch(/^\d+$/);
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    expect(Number(retryAfter)).toBeLessThanOrEqual(60);
  });

  it('counts emails case-insensitively and does not affect other emails', async () => {
    const email = uniqueEmail();
    for (let i = 0; i < 5; i++) await book({ slot_id: 'nope', name: 'Ada', email: i % 2 ? email.toUpperCase() : email });
    await book({ slot_id: 's1', name: 'Ada', email }).expect(429);
    await book({ slot_id: 's1', name: 'Bola', email: uniqueEmail() }).expect(201);
  });

  it('holds exactly under a concurrent burst', async () => {
    const email = uniqueEmail();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => book({ slot_id: 'nope', name: 'Ada', email })),
    );
    expect(results.filter((r) => r.status === 404)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(7);
  });
});
