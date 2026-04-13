# Pocket AI

**Control your PC's AI CLI from anywhere — phone, tablet, or another computer**

All communication is E2E encrypted with AES-256-GCM. The server never sees your data.

[한국어](docs/README.ko.md)

---

## Setup

If you use Claude Code, just copy-paste a prompt below — Claude handles the rest.

### Local Setup (same WiFi)

> Paste into Claude Code:

```
Set up this project (Pocket AI) locally.

1. Run `npm install`
2. Run `npm run dev`
3. Tell me the Setup Token from the console output
4. Server: localhost:9741, PWA: localhost:9742

When done, summarize the Setup Token and access URLs.
```

That's it. Open `localhost:9742`, enter the token, and start using it.

### Remote Access Setup (access from anywhere)

To use from outside your local network, deploy the relay server to the cloud.

> Paste into Claude Code:

```
Deploy the Pocket AI relay server to Railway.

1. Install railway CLI if missing: `npm install -g @railway/cli`
2. Login with `railway login` (opens browser)
3. Create project with `railway new`
4. Deploy the apps/server directory
5. Set environment variables:
   - JWT_SECRET: generate random (openssl rand -base64 32)
   - AUTH_MODE: single
   - AUTH_TOKEN: create a memorable token for me
   - PORT: 9741
6. Tell me the Railway URL when deployed
7. Set NEXT_PUBLIC_API_URL in local apps/pwa/.env to the deployed URL
8. Run `npm run dev` for PWA locally, or deploy to Vercel

Summarize the access URL and Setup Token when done.
```

> Prefer Fly.io? Just replace "Railway" with "Fly.io" in the prompt.

---

## Usage

### CLI

```bash
npm install -g @pocket-ai/cli

pocket-ai login --token <Setup Token>   # Login
pocket-ai                                # Start Claude Code + remote
pocket-ai start codex                    # Use Codex
pocket-ai start gemini                   # Use Gemini
pocket-ai start --cmd "aider"            # Custom CLI
```

### PWA

Open `localhost:9742` (local) or your deployed URL → Enter Setup Token → Select active session → Use

---

## Features

- **Multi-model orchestration**: Claude delegates to Gemini, Codex, and Aider as workers
- **E2E encryption**: AES-256-GCM — the server never sees plaintext
- **Local history restore**: Chat history stays on your PC, auto-synced on reconnect
- **Remote permission control**: Approve/deny file edits and command execution from your phone
- **Rich tool views**: Edit diffs, Bash output, syntax highlighting, worker progress

---

## Architecture

```
PWA (browser/phone) ←→ Relay Server (Socket.IO) ←→ CLI (your PC)
                       E2E encrypted relay only         │
                       No message storage          ┌────▼─────┐
                                                   │Claude Code│
                                                   │Codex CLI  │
                                                   │Gemini CLI │
                                                   │Custom CLI │
                                                   └──────────┘
```

**Pure Relay**: The server only relays encrypted messages. It never stores message content or encryption keys.

---

## Manual Setup (without Claude Code)

```bash
git clone https://github.com/iops-leo/pocket-ai
cd pocket-ai
npm install        # Dependencies + auto-builds wire package
npm run dev        # Auto-generates .env → runs migrations → starts server + PWA
```

The Setup Token is printed to the server console. Enter it at `localhost:9742`.

### Environment Variables (optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_MODE` | `single` | `single`: token auth, `github`: GitHub OAuth |
| `AUTH_TOKEN` | auto-generated | Fixed token (regenerated each restart if unset) |
| `JWT_SECRET` | auto-generated | JWT signing key |
| `DATABASE_PATH` | `./data/pocket-ai.db` | SQLite database file path |
| `PORT` | `9741` | Server port |

---

## Package Structure

```
pocket-ai/
├── apps/
│   ├── server/    # Fastify + Socket.IO relay
│   └── pwa/       # Next.js PWA
├── packages/
│   ├── cli/       # pocket-ai CLI
│   └── wire/      # Shared types + encryption utils
└── docs/
```

---

## License

MIT License
