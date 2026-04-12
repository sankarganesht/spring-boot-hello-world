# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview
#Do not work or scan outside of this folder C:\AI
This repo contains two independent applications:
#
1. **Spring Boot Hello World** (root) — A minimal Java web app with a name-input form
2. **UIGen** (`uigen/`) — An AI-powered React component generator with live preview

---

## Spring Boot App

**Run (requires Java 17+ and Maven):**
```bash
export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.10.7-hotspot"
export PATH="/tmp/apache-maven-3.9.6/bin:$JAVA_HOME/bin:$PATH"
mvn spring-boot:run
```
Runs on **port 8081** (changed from default 8080 due to conflict).

**Entry point:** `src/main/java/com/example/helloworld/controller/HelloController.java`
- GET `/` accepts optional `?name=` param, passes it to Thymeleaf template `hello.html`

---

## UIGen (uigen/)

### Commands

```bash
# First-time setup
npm run setup           # npm install + prisma generate + prisma migrate dev

# Development
npm run dev             # Next.js dev server on port 3000 (Turbopack)

# Production
npm run build
npm run start

# Testing
npm test                # Vitest (jsdom environment)
npm test -- path/to/file.test.tsx   # Run single test file

# Linting
npm run lint

# Database
npm run db:reset        # Force reset all migrations
```

### Environment

Requires `uigen/.env` with:
- `ANTHROPIC_API_KEY` — without it, falls back to a `MockLanguageModel` that generates static examples
- `JWT_SECRET` — defaults to `"development-secret-key"` if absent

### Architecture

The app lets users describe a UI in chat, and Claude generates React components into a **virtual in-memory file system**. The result renders live in a preview panel.

**Key data flow:**
1. User sends a message → `ChatContext` serializes the virtual FS state → POST `/api/chat`
2. `/api/chat` streams a response from `claude-haiku-4-5` via Vercel AI SDK
3. Claude calls tools (`str_replace_editor`, `file_manager`) to write/edit virtual files
4. Tool results update `FileSystemContext` → triggers preview re-render
5. `PreviewFrame` compiles `App.jsx` on-the-fly via Babel standalone and renders it

**Virtual File System** (`src/lib/file-system.ts`):
- Entirely in-memory; nothing is written to disk
- Root is `/`; Claude always creates `/App.jsx` as the component entrypoint
- Serialized to JSON for API requests and database persistence
- Anonymous users get an ephemeral FS; authenticated users can save/load projects

**AI tools available to Claude** (`src/lib/tools/`):
- `str_replace_editor`: create / str_replace / insert / view files
- `file_manager`: rename / delete files and directories

**Authentication** (`src/lib/auth.ts`):
- JWT stored in httpOnly cookie, 7-day expiry
- Middleware (`src/middleware.ts`) protects routes
- Anonymous use is fully supported — auth only required to persist projects

**Database** (Prisma + SQLite at `prisma/dev.db`):
- `User` — email + bcrypt password
- `Project` — stores serialized file system (`data`) and chat history (`messages`) as JSON strings

**`node-compat.cjs`**: Required on Node 25+ which exposes non-functional `localStorage`/`sessionStorage` globals that break Next.js SSR. The file deletes these globals server-side. Loaded via `NODE_OPTIONS="--require ./node-compat.cjs"` in all package.json scripts (handled by `cross-env` for Windows compatibility).

**AI generation prompt** (`src/lib/prompts/generation.tsx`):
- Components must use Tailwind CSS v4
- Import aliases use `@/` prefix for non-library files
- `/App.jsx` is always the root entrypoint
