import { EncryptedData } from './encryption';

/**
 * Payload sent by the PC (cli) when it first connects to the server
 * to authenticate its session and register its ECDH public key.
 */
export interface ClientAuthPayload {
    token: string;          // JWT token 
    sessionId?: string;     // If reconnecting, the existing session ID
    publicKey: string;      // Base64 spki encoded ECDH public key (P-256)
    metadata: {
        hostname: string;
        platform: string;
        cpus: number;
        agentVersion: string;
    };
}

/**
 * Payload sent by the PWA to join a specific session's room.
 */
export interface SessionJoinPayload {
    sessionId: string;
}

/**
 * Payload sent by the server to confirm successful authentication
 * and provide the assigned Session ID.
 */
export interface ClientAuthResponse {
    success: boolean;
    sessionId?: string;
    error?: string;
}

/**
 * Envelope for end-to-end encrypted messages passing through the server.
 * The server does not inspect the `body`.
 */
export interface EncryptedMessage {
    t: 'encrypted';
    sessionId: string;
    sender: 'cli' | 'pwa';

    // The actual AES-256-GCM encrypted payload (EncryptedData)
    // Inside the cipher is a JSON string of SessionPayload (from types.ts)
    body: EncryptedData;

    // Ephemeral ECDH public key for key exchange when PWA sends the first message
    // Or when keys are rotated. Base64 spki.
    k?: string;
}
