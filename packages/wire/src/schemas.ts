import { z } from 'zod';

// REST API Schemas

/** POST /api/sessions body */
export const CreateSessionSchema = z.object({
  publicKey: z.string().min(1),
  metadata: z.object({
    hostname: z.string().optional(),
    engine: z.string().optional(),
  }).optional(),
});
export type CreateSessionBody = z.infer<typeof CreateSessionSchema>;

// Socket.IO Event Schemas

/** client-auth event payload (Zod-validated) */
export const ClientAuthSchema = z.object({
  sessionId: z.string().uuid(),
  token: z.string().min(1),
});
/** Inferred type from ClientAuthSchema - use ClientAuthPayload from socket.ts for the full interface */
export type ClientAuthSchemaPayload = z.infer<typeof ClientAuthSchema>;

/** session-join event payload (Zod-validated) */
export const SessionJoinSchema = z.object({
  sessionId: z.string().uuid(),
  token: z.string().min(1),
});
/** Inferred type from SessionJoinSchema - use SessionJoinPayload from socket.ts for the full interface */
export type SessionJoinSchemaPayload = z.infer<typeof SessionJoinSchema>;

/** key-exchange event payload */
export const KeyExchangeSchema = z.object({
  sessionId: z.string().uuid(),
  publicKey: z.string().min(1),
  sender: z.enum(['cli', 'pwa']),
});
export type KeyExchangePayload = z.infer<typeof KeyExchangeSchema>;

/** session-key event payload (wrapped AES-256-GCM session key) */
export const SessionKeySchema = z.object({
    sessionId: z.string().uuid(),
    wrappedKey: z.object({
        cipher: z.string().min(1),
        iv: z.string().min(1),
    }),
});
export type SessionKeyPayload = z.infer<typeof SessionKeySchema>;

/** update (encrypted message relay) event payload */
export const UpdateSchema = z.object({
  sessionId: z.string().uuid(),
  sender: z.enum(['cli', 'pwa']),
  body: z.object({
    cipher: z.string().min(1),
    iv: z.string().min(1),
  }),
});
export type UpdatePayload = z.infer<typeof UpdateSchema>;
