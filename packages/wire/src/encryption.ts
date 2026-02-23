/**
 * Pocket AI wire encryption utilities.
 * 
 * Uses the Web Crypto API, which is available in modern browsers (PWA)
 * and in Node.js >= 19 (CLI).
 */

/**
 * Interface representing the structure of an encrypted message container.
 */
export interface EncryptedData {
    cipher: string; // Base64 encoded ciphertext
    iv: string;     // Base64 encoded Initialization Vector (nonce)
}

/**
 * Generates an ECDH CryptoKeyPair (P-256).
 * Both private and public keys are extractable for the PC to save its private key.
 */
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
    return await globalThis.crypto.subtle.generateKey(
        {
            name: 'ECDH',
            namedCurve: 'P-256',
        },
        true, // extractable
        ['deriveKey', 'deriveBits']
    );
}

/**
 * Derives an AES-256-GCM symmetric key from our private key and the peer's public key.
 */
export async function deriveSharedSecret(
    privateKey: CryptoKey,
    publicKey: CryptoKey
): Promise<CryptoKey> {
    return await globalThis.crypto.subtle.deriveKey(
        {
            name: 'ECDH',
            public: publicKey,
        },
        privateKey,
        {
            name: 'AES-GCM',
            length: 256,
        },
        false, // NOT extractable - AES key should never be exported
        ['encrypt', 'decrypt']
    );
}

/**
 * Exports a CryptoKey to raw or spki/pkcs8 format as base64 string.
 * This is useful for transferring the public key over the wire.
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await globalThis.crypto.subtle.exportKey('spki', key);
    return Buffer.from(exported).toString('base64');
}

/**
 * Imports a base64 encoded public key (spki format) back to a CryptoKey.
 */
export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
    const der = Buffer.from(base64Key, 'base64');
    return await globalThis.crypto.subtle.importKey(
        'spki',
        der,
        {
            name: 'ECDH',
            namedCurve: 'P-256',
        },
        true,
        []
    );
}

/**
 * Exports a private key to PKCS8 format as base64 string.
 * Used for persisting the CLI's private key to enable message history decryption.
 */
export async function exportPrivateKey(key: CryptoKey): Promise<string> {
    const exported = await globalThis.crypto.subtle.exportKey('pkcs8', key);
    return Buffer.from(exported).toString('base64');
}

/**
 * Imports a base64 encoded private key (PKCS8 format) back to a CryptoKey.
 */
export async function importPrivateKey(base64Key: string): Promise<CryptoKey> {
    const der = Buffer.from(base64Key, 'base64');
    return await globalThis.crypto.subtle.importKey(
        'pkcs8',
        der,
        {
            name: 'ECDH',
            namedCurve: 'P-256',
        },
        true,
        ['deriveKey', 'deriveBits']
    );
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedData> {
    const enc = new TextEncoder();
    const encodedText = enc.encode(plaintext);

    // 96-bit (12 bytes) IV (nonce) is standard for GCM
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

    const cipherBuffer = await globalThis.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        key,
        encodedText
    );

    return {
        cipher: Buffer.from(cipherBuffer).toString('base64'),
        iv: Buffer.from(iv).toString('base64'),
    };
}

/**
 * Decrypts an EncryptedData object using AES-256-GCM.
 */
export async function decrypt(encrypted: EncryptedData, key: CryptoKey): Promise<string> {
    const iv = Buffer.from(encrypted.iv, 'base64');
    const cipherBuffer = Buffer.from(encrypted.cipher, 'base64');

    const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv,
        },
        key,
        cipherBuffer
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
}

/**
 * Generates a new AES-256-GCM session key (extractable for export/wrap).
 */
export async function generateSessionKey(): Promise<CryptoKey> {
    return await globalThis.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable — needed for export and wrap
        ['encrypt', 'decrypt']
    );
}

/**
 * Exports an AES-256-GCM CryptoKey to base64 raw format (for storage/transmission).
 */
export async function exportSessionKey(key: CryptoKey): Promise<string> {
    const raw = await globalThis.crypto.subtle.exportKey('raw', key);
    return Buffer.from(raw).toString('base64');
}

/**
 * Imports a base64 raw AES-256-GCM key back to CryptoKey.
 */
export async function importSessionKey(base64Key: string): Promise<CryptoKey> {
    const raw = Buffer.from(base64Key, 'base64');
    return await globalThis.crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'AES-GCM', length: 256 },
        true, // extractable
        ['encrypt', 'decrypt']
    );
}

/**
 * Wraps (encrypts) a session key using an ECDH-derived shared secret.
 * The session key is exported to raw bytes, then encrypted with AES-256-GCM.
 */
export async function wrapSessionKey(
    sessionKey: CryptoKey,
    ecdhSecret: CryptoKey
): Promise<EncryptedData> {
    const raw = await globalThis.crypto.subtle.exportKey('raw', sessionKey);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const cipherBuffer = await globalThis.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        ecdhSecret,
        raw
    );
    return {
        cipher: Buffer.from(cipherBuffer).toString('base64'),
        iv: Buffer.from(iv).toString('base64'),
    };
}

/**
 * Unwraps (decrypts) a session key that was wrapped with an ECDH-derived shared secret.
 */
export async function unwrapSessionKey(
    wrapped: EncryptedData,
    ecdhSecret: CryptoKey
): Promise<CryptoKey> {
    const iv = Buffer.from(wrapped.iv, 'base64');
    const cipherBuffer = Buffer.from(wrapped.cipher, 'base64');
    const rawBuffer = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        ecdhSecret,
        cipherBuffer
    );
    return await globalThis.crypto.subtle.importKey(
        'raw',
        rawBuffer,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}
