import { describe, it, expect, beforeAll } from 'vitest';
import {
    generateECDHKeyPair,
    deriveSharedSecret,
    exportPublicKey,
    importPublicKey,
    encrypt,
    decrypt
} from '../src/encryption';

// Polyfill globalThis.crypto for Node.js if needed (Node <20 might need this in some test environments, though Node 20 has it).
if (typeof globalThis.crypto === 'undefined') {
    globalThis.crypto = require('crypto').webcrypto as any;
}

describe('E2E Encryption Flow with ECDH + AES-GCM', () => {
    let pcKeys: CryptoKeyPair;
    let pwaKeys: CryptoKeyPair;

    beforeAll(async () => {
        // 1. Both PC and PWA generate their ephemeral key pairs
        pcKeys = await generateECDHKeyPair();
        pwaKeys = await generateECDHKeyPair();
    });

    it('should generate valid ECDH key pairs', () => {
        expect(pcKeys.privateKey).toBeDefined();
        expect(pcKeys.publicKey).toBeDefined();
        expect(pwaKeys.privateKey).toBeDefined();
        expect(pwaKeys.publicKey).toBeDefined();
    });

    it('should export and import public keys successfully', async () => {
        // 2. PC exports its public key to send to PWA (via Server)
        const pcPubKeyBase64 = await exportPublicKey(pcKeys.publicKey);
        expect(typeof pcPubKeyBase64).toBe('string');
        expect(pcPubKeyBase64.length).toBeGreaterThan(0);

        // 3. PWA imports the PC's public key
        const importedPcPubKey = await importPublicKey(pcPubKeyBase64);
        expect(importedPcPubKey.type).toBe('public');
        expect(importedPcPubKey.algorithm.name).toBe('ECDH');
    });

    it('should derive the identical shared AES-GCM secret on both sides', async () => {
        // 4. PWA derives shared secret using its private key and PC's public key
        const pwaSharedSecret = await deriveSharedSecret(pwaKeys.privateKey, pcKeys.publicKey);

        // 5. PC derives shared secret using its private key and PWA's public key
        const pcSharedSecret = await deriveSharedSecret(pcKeys.privateKey, pwaKeys.publicKey);

        // Keys are non-extractable by design (security), so verify symmetry via encrypt/decrypt:
        // If both sides derived the same secret, PWA can encrypt and PC can decrypt
        const testMessage = 'symmetric-key-verification';
        const encrypted = await encrypt(testMessage, pwaSharedSecret);
        const decrypted = await decrypt(encrypted, pcSharedSecret);
        expect(decrypted).toBe(testMessage);
    });

    it('should securely encrypt and decrypt messages using the shared secret', async () => {
        const pwaSharedSecret = await deriveSharedSecret(pwaKeys.privateKey, pcKeys.publicKey);
        const pcSharedSecret = await deriveSharedSecret(pcKeys.privateKey, pwaKeys.publicKey);

        const originalMessage = JSON.stringify({ t: 'text', text: 'Hello from PWA!' });

        // 6. PWA encrypts message
        const encryptedData = await encrypt(originalMessage, pwaSharedSecret);

        expect(encryptedData.cipher).toBeDefined();
        expect(encryptedData.iv).toBeDefined();
        expect(encryptedData.cipher).not.toBe(originalMessage);

        // 7. PC decrypts message
        const decryptedMessage = await decrypt(encryptedData, pcSharedSecret);

        expect(decryptedMessage).toBe(originalMessage);
    });
});
