import { describe, it, expect } from 'vitest';
import {
  generateECDHKeyPair,
  deriveSharedSecret,
  exportPublicKey,
  importPublicKey,
  encrypt,
  decrypt,
} from '../encryption.js';

describe('generateECDHKeyPair', () => {
  it('should return a CryptoKeyPair with publicKey and privateKey', async () => {
    const keyPair = await generateECDHKeyPair();
    expect(keyPair).toBeDefined();
    expect(keyPair.publicKey).toBeDefined();
    expect(keyPair.privateKey).toBeDefined();
  });

  it('should return extractable keys with correct algorithm', async () => {
    const keyPair = await generateECDHKeyPair();
    expect(keyPair.publicKey.algorithm.name).toBe('ECDH');
    expect(keyPair.privateKey.algorithm.name).toBe('ECDH');
    expect(keyPair.publicKey.extractable).toBe(true);
    expect(keyPair.privateKey.extractable).toBe(true);
  });

  it('should return keys with correct type', async () => {
    const keyPair = await generateECDHKeyPair();
    expect(keyPair.publicKey.type).toBe('public');
    expect(keyPair.privateKey.type).toBe('private');
  });

  it('should generate unique key pairs on each call', async () => {
    const kpA = await generateECDHKeyPair();
    const kpB = await generateECDHKeyPair();
    const exportedA = await exportPublicKey(kpA.publicKey);
    const exportedB = await exportPublicKey(kpB.publicKey);
    expect(exportedA).not.toBe(exportedB);
  });
});

describe('exportPublicKey / importPublicKey', () => {
  it('should export a public key to a non-empty base64 string', async () => {
    const { publicKey } = await generateECDHKeyPair();
    const exported = await exportPublicKey(publicKey);
    expect(typeof exported).toBe('string');
    expect(exported.length).toBeGreaterThan(0);
    // Base64 strings only contain valid characters
    expect(exported).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should import a previously exported public key back to a CryptoKey', async () => {
    const { publicKey } = await generateECDHKeyPair();
    const exported = await exportPublicKey(publicKey);
    const imported = await importPublicKey(exported);
    expect(imported).toBeDefined();
    expect(imported.type).toBe('public');
    expect(imported.algorithm.name).toBe('ECDH');
    expect(imported.extractable).toBe(true);
  });

  it('should round-trip export/import and preserve key usability', async () => {
    const kpA = await generateECDHKeyPair();
    const kpB = await generateECDHKeyPair();

    // Export A's public key and reimport it
    const exportedA = await exportPublicKey(kpA.publicKey);
    const reimportedA = await importPublicKey(exportedA);

    // B should be able to derive a shared secret using the reimported A public key
    const sharedKey = await deriveSharedSecret(kpB.privateKey, reimportedA);
    expect(sharedKey).toBeDefined();
    expect(sharedKey.algorithm.name).toBe('AES-GCM');
  });

  it('should reject invalid base64 input', async () => {
    await expect(importPublicKey('not-valid-spki!!!')).rejects.toThrow();
  });
});

describe('deriveSharedSecret', () => {
  it('should produce an AES-GCM CryptoKey', async () => {
    const kpA = await generateECDHKeyPair();
    const kpB = await generateECDHKeyPair();
    const secret = await deriveSharedSecret(kpA.privateKey, kpB.publicKey);
    expect(secret.algorithm.name).toBe('AES-GCM');
    expect(secret.type).toBe('secret');
  });

  it('should produce non-extractable AES key', async () => {
    const kpA = await generateECDHKeyPair();
    const kpB = await generateECDHKeyPair();
    const secret = await deriveSharedSecret(kpA.privateKey, kpB.publicKey);
    expect(secret.extractable).toBe(false);
  });

  it('should produce the same effective shared secret from both sides (ECDH symmetry)', async () => {
    const kpA = await generateECDHKeyPair();
    const kpB = await generateECDHKeyPair();

    const secretAB = await deriveSharedSecret(kpA.privateKey, kpB.publicKey);
    const secretBA = await deriveSharedSecret(kpB.privateKey, kpA.publicKey);

    const plaintext = 'ECDH symmetry test';
    const encrypted = await encrypt(plaintext, secretAB);
    const decrypted = await decrypt(encrypted, secretBA);
    expect(decrypted).toBe(plaintext);
  });
});

describe('encrypt / decrypt', () => {
  const makeKey = async () => {
    const kpA = await generateECDHKeyPair();
    const kpB = await generateECDHKeyPair();
    return deriveSharedSecret(kpA.privateKey, kpB.publicKey);
  };

  it('should return an object with cipher and iv fields', async () => {
    const key = await makeKey();
    const result = await encrypt('hello', key);
    expect(result).toHaveProperty('cipher');
    expect(result).toHaveProperty('iv');
    expect(typeof result.cipher).toBe('string');
    expect(typeof result.iv).toBe('string');
  });

  it('should produce base64-encoded cipher and iv', async () => {
    const key = await makeKey();
    const result = await encrypt('hello', key);
    // Should decode without throwing
    expect(Buffer.from(result.cipher, 'base64').length).toBeGreaterThan(0);
    expect(Buffer.from(result.iv, 'base64').length).toBe(12); // 96-bit IV
  });

  it('should decrypt back to the original plaintext', async () => {
    const key = await makeKey();
    const plaintext = 'Hello, World!';
    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce a different IV on each call (random nonce)', async () => {
    const key = await makeKey();
    const e1 = await encrypt('same message', key);
    const e2 = await encrypt('same message', key);
    expect(e1.iv).not.toBe(e2.iv);
  });

  it('should produce different ciphertext for same plaintext due to random IV', async () => {
    const key = await makeKey();
    const e1 = await encrypt('same message', key);
    const e2 = await encrypt('same message', key);
    expect(e1.cipher).not.toBe(e2.cipher);
    // Both must still decrypt correctly
    expect(await decrypt(e1, key)).toBe('same message');
    expect(await decrypt(e2, key)).toBe('same message');
  });

  it('should handle an empty string', async () => {
    const key = await makeKey();
    const encrypted = await encrypt('', key);
    const decrypted = await decrypt(encrypted, key);
    expect(decrypted).toBe('');
  });

  it('should handle unicode and emoji text', async () => {
    const key = await makeKey();
    const plaintext = '한국어 테스트 🚀 日本語';
    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should handle large messages', async () => {
    const key = await makeKey();
    const plaintext = 'A'.repeat(100_000);
    const encrypted = await encrypt(plaintext, key);
    const decrypted = await decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should handle a JSON payload (realistic wire message)', async () => {
    const key = await makeKey();
    const payload = JSON.stringify({ t: 'text', text: 'Hello from CLI' });
    const encrypted = await encrypt(payload, key);
    const decrypted = await decrypt(encrypted, key);
    expect(JSON.parse(decrypted)).toEqual({ t: 'text', text: 'Hello from CLI' });
  });

  it('should fail to decrypt with a different key', async () => {
    const kpA = await generateECDHKeyPair();
    const kpB = await generateECDHKeyPair();
    const kpC = await generateECDHKeyPair();

    const keyAB = await deriveSharedSecret(kpA.privateKey, kpB.publicKey);
    const keyAC = await deriveSharedSecret(kpA.privateKey, kpC.publicKey);

    const encrypted = await encrypt('secret', keyAB);
    await expect(decrypt(encrypted, keyAC)).rejects.toThrow();
  });

  it('should fail to decrypt tampered cipher data', async () => {
    const key = await makeKey();
    const encrypted = await encrypt('test message', key);

    // Corrupt the cipher (append a character to make base64 decode to different bytes)
    const tampered = {
      ...encrypted,
      cipher: Buffer.from(
        Buffer.from(encrypted.cipher, 'base64').map((b, i) => (i === 0 ? b ^ 0xff : b))
      ).toString('base64'),
    };
    await expect(decrypt(tampered, key)).rejects.toThrow();
  });

  it('should fail to decrypt with a tampered IV', async () => {
    const key = await makeKey();
    const encrypted = await encrypt('test message', key);

    const ivBytes = Buffer.from(encrypted.iv, 'base64');
    ivBytes[0] ^= 0xff; // flip bits in first IV byte
    const tampered = { ...encrypted, iv: ivBytes.toString('base64') };

    await expect(decrypt(tampered, key)).rejects.toThrow();
  });
});
