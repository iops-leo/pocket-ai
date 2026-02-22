import { describe, it, expect } from 'vitest';
import {
  CreateSessionSchema,
  ClientAuthSchema,
  SessionJoinSchema,
  KeyExchangeSchema,
  UpdateSchema,
} from '../schemas.js';

// ---------------------------------------------------------------------------
// CreateSessionSchema
// ---------------------------------------------------------------------------
describe('CreateSessionSchema', () => {
  it('should accept a valid payload with publicKey only', () => {
    const result = CreateSessionSchema.safeParse({ publicKey: 'base64encodedkey' });
    expect(result.success).toBe(true);
  });

  it('should accept a payload with all optional metadata fields', () => {
    const result = CreateSessionSchema.safeParse({
      publicKey: 'base64encodedkey',
      metadata: { hostname: 'MacBook-Pro', engine: 'claude' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept a payload with partial metadata (only hostname)', () => {
    const result = CreateSessionSchema.safeParse({
      publicKey: 'base64encodedkey',
      metadata: { hostname: 'dev-box' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept a payload with partial metadata (only engine)', () => {
    const result = CreateSessionSchema.safeParse({
      publicKey: 'base64encodedkey',
      metadata: { engine: 'codex' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept a payload with empty metadata object', () => {
    const result = CreateSessionSchema.safeParse({
      publicKey: 'base64encodedkey',
      metadata: {},
    });
    expect(result.success).toBe(true);
  });

  it('should reject an empty publicKey string', () => {
    const result = CreateSessionSchema.safeParse({ publicKey: '' });
    expect(result.success).toBe(false);
  });

  it('should reject a missing publicKey', () => {
    const result = CreateSessionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject a non-string publicKey', () => {
    const result = CreateSessionSchema.safeParse({ publicKey: 12345 });
    expect(result.success).toBe(false);
  });

  it('should infer the correct TypeScript type', () => {
    const valid = { publicKey: 'key', metadata: { hostname: 'h', engine: 'e' } };
    const result = CreateSessionSchema.safeParse(valid);
    if (result.success) {
      // Type-level assertion: these properties must exist
      expect(result.data.publicKey).toBe('key');
      expect(result.data.metadata?.hostname).toBe('h');
      expect(result.data.metadata?.engine).toBe('e');
    }
  });
});

// ---------------------------------------------------------------------------
// ClientAuthSchema
// ---------------------------------------------------------------------------
describe('ClientAuthSchema', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  it('should accept a valid sessionId UUID and token', () => {
    const result = ClientAuthSchema.safeParse({ sessionId: validUUID, token: 'jwt.token.here' });
    expect(result.success).toBe(true);
  });

  it('should reject a non-UUID sessionId', () => {
    const result = ClientAuthSchema.safeParse({ sessionId: 'sess_123', token: 'jwt' });
    expect(result.success).toBe(false);
  });

  it('should reject a plain string that looks like an ID but is not a UUID', () => {
    const result = ClientAuthSchema.safeParse({ sessionId: '12345678', token: 'jwt' });
    expect(result.success).toBe(false);
  });

  it('should reject an empty token', () => {
    const result = ClientAuthSchema.safeParse({ sessionId: validUUID, token: '' });
    expect(result.success).toBe(false);
  });

  it('should reject a missing sessionId', () => {
    const result = ClientAuthSchema.safeParse({ token: 'jwt.token.here' });
    expect(result.success).toBe(false);
  });

  it('should reject a missing token', () => {
    const result = ClientAuthSchema.safeParse({ sessionId: validUUID });
    expect(result.success).toBe(false);
  });

  it('should reject an empty object', () => {
    const result = ClientAuthSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should accept different valid UUIDs', () => {
    const uuids = [
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    ];
    for (const uuid of uuids) {
      const result = ClientAuthSchema.safeParse({ sessionId: uuid, token: 'tok' });
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// SessionJoinSchema
// ---------------------------------------------------------------------------
describe('SessionJoinSchema', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  it('should accept a valid sessionId and token', () => {
    const result = SessionJoinSchema.safeParse({ sessionId: validUUID, token: 'jwt.token.here' });
    expect(result.success).toBe(true);
  });

  it('should reject a non-UUID sessionId', () => {
    const result = SessionJoinSchema.safeParse({ sessionId: 'not-a-uuid', token: 'jwt' });
    expect(result.success).toBe(false);
  });

  it('should reject an empty token', () => {
    const result = SessionJoinSchema.safeParse({ sessionId: validUUID, token: '' });
    expect(result.success).toBe(false);
  });

  it('should reject missing fields', () => {
    expect(SessionJoinSchema.safeParse({}).success).toBe(false);
    expect(SessionJoinSchema.safeParse({ sessionId: validUUID }).success).toBe(false);
    expect(SessionJoinSchema.safeParse({ token: 'jwt' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// KeyExchangeSchema
// ---------------------------------------------------------------------------
describe('KeyExchangeSchema', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  it('should accept sender "pwa"', () => {
    const result = KeyExchangeSchema.safeParse({
      sessionId: validUUID,
      publicKey: 'base64key==',
      sender: 'pwa',
    });
    expect(result.success).toBe(true);
  });

  it('should accept sender "cli"', () => {
    const result = KeyExchangeSchema.safeParse({
      sessionId: validUUID,
      publicKey: 'base64key==',
      sender: 'cli',
    });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid sender value', () => {
    const result = KeyExchangeSchema.safeParse({
      sessionId: validUUID,
      publicKey: 'base64key==',
      sender: 'agent',
    });
    expect(result.success).toBe(false);
  });

  it('should reject an empty sender string', () => {
    const result = KeyExchangeSchema.safeParse({
      sessionId: validUUID,
      publicKey: 'base64key==',
      sender: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject an empty publicKey', () => {
    const result = KeyExchangeSchema.safeParse({
      sessionId: validUUID,
      publicKey: '',
      sender: 'cli',
    });
    expect(result.success).toBe(false);
  });

  it('should reject a non-UUID sessionId', () => {
    const result = KeyExchangeSchema.safeParse({
      sessionId: 'bad-id',
      publicKey: 'base64key',
      sender: 'pwa',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing sessionId', () => {
    const result = KeyExchangeSchema.safeParse({ publicKey: 'key', sender: 'cli' });
    expect(result.success).toBe(false);
  });

  it('should reject missing publicKey', () => {
    const result = KeyExchangeSchema.safeParse({ sessionId: validUUID, sender: 'cli' });
    expect(result.success).toBe(false);
  });

  it('should reject missing sender', () => {
    const result = KeyExchangeSchema.safeParse({ sessionId: validUUID, publicKey: 'key' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpdateSchema
// ---------------------------------------------------------------------------
describe('UpdateSchema', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  it('should accept a valid encrypted message from cli', () => {
    const result = UpdateSchema.safeParse({
      sessionId: validUUID,
      sender: 'cli',
      body: { cipher: 'encrypteddata==', iv: 'aGVsbG8=' },
    });
    expect(result.success).toBe(true);
  });

  it('should accept a valid encrypted message from pwa', () => {
    const result = UpdateSchema.safeParse({
      sessionId: validUUID,
      sender: 'pwa',
      body: { cipher: 'encrypteddata==', iv: 'aGVsbG8=' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid sender', () => {
    const result = UpdateSchema.safeParse({
      sessionId: validUUID,
      sender: 'server',
      body: { cipher: 'data', iv: 'iv' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject a missing body', () => {
    const result = UpdateSchema.safeParse({ sessionId: validUUID, sender: 'cli' });
    expect(result.success).toBe(false);
  });

  it('should reject a body missing the iv field', () => {
    const result = UpdateSchema.safeParse({
      sessionId: validUUID,
      sender: 'cli',
      body: { cipher: 'encrypteddata' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject a body missing the cipher field', () => {
    const result = UpdateSchema.safeParse({
      sessionId: validUUID,
      sender: 'cli',
      body: { iv: 'initvector' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject an empty cipher string', () => {
    const result = UpdateSchema.safeParse({
      sessionId: validUUID,
      sender: 'pwa',
      body: { cipher: '', iv: 'initvector' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject an empty iv string', () => {
    const result = UpdateSchema.safeParse({
      sessionId: validUUID,
      sender: 'pwa',
      body: { cipher: 'ciphertext', iv: '' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject a non-UUID sessionId', () => {
    const result = UpdateSchema.safeParse({
      sessionId: 'bad-session-id',
      sender: 'cli',
      body: { cipher: 'data', iv: 'iv' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject an empty object', () => {
    const result = UpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should expose parsed data with correct shape on success', () => {
    const input = {
      sessionId: validUUID,
      sender: 'pwa' as const,
      body: { cipher: 'abc123==', iv: 'def456==' },
    };
    const result = UpdateSchema.safeParse(input);
    if (result.success) {
      expect(result.data.sessionId).toBe(validUUID);
      expect(result.data.sender).toBe('pwa');
      expect(result.data.body.cipher).toBe('abc123==');
      expect(result.data.body.iv).toBe('def456==');
    }
  });
});
