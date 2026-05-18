<div align="center">

# 🖥️ CppNote

**A modern, multi-user, containerized C++ Notebook Environment**

*Write, execute, and document C++17 code interactively — just like Jupyter, but for C++.*

<br/>

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/your-org/cppnote/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/your-org/cppnote/actions)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![C++](https://img.shields.io/badge/C%2B%2B17-00599C?style=flat&logo=c%2B%2B&logoColor=white)](https://en.cppreference.com)
[![Docker](https://img.shields.io/badge/Docker-2CA5E0?style=flat&logo=docker&logoColor=white)](https://www.docker.com)

</div>

---

## ⚡ Quick Start

> Get CppNote running in under two minutes with Docker.

```bash
git clone https://github.com/your-org/cppnote.git
cd cppnote
cp .env.example .env          # configure your secrets (see §8)
docker-compose up --build -d
```

| Service | URL |
|---------|-----|
| Frontend (React UI) | http://localhost:5173 |
| Backend API + Swagger | http://localhost:8000/docs |

**Default credentials:** `admin@cppnote.local` / `cppnote123`

---

## Table of Contents

- [1. Project Overview](#1-project-overview)
- [2. Architecture](#2-architecture)
- [3. Folder & File Structure](#3-folder--file-structure)
- [4. Technology Stack](#4-technology-stack)
- [5. Dependencies](#5-dependencies)
- [6. Installation Guide](#6-installation-guide)
- [7. Environment Variables](#7-environment-variables)
- [8. Workflows](#8-workflows)
- [9. Data Structures & Models](#9-data-structures--models)
- [10. API Reference](#10-api-reference)
- [11. Authentication & Security](#11-authentication--security)
- [12. Configuration](#12-configuration)
- [13. Build & Deployment](#13-build--deployment)
- [14. Testing](#14-testing)
- [15. Performance & Scalability](#15-performance--scalability)
- [16. Error Handling & Debugging](#16-error-handling--debugging)
- [17. Troubleshooting](#17-troubleshooting)
- [18. Developer Experience](#18-developer-experience)
- [19. Contribution Guide](#19-contribution-guide)
- [20. Roadmap](#20-roadmap)
- [21. FAQ](#21-faq)

---

## 1. Project Overview

**CppNote** is a fully-featured, web-based interactive notebook environment built specifically for C++. It bridges the gap between traditional compiled C++ development and the interactive, exploratory experience of Python's Jupyter Notebooks.

### The Problem It Solves

Developing in C++ typically requires a strict compile → link → run cycle, which drastically slows down experimentation, algorithm testing, and data exploration. CppNote leverages the `xeus-cling` C++ kernel running inside a secure, containerized backend to provide **immediate code execution**, **REPL capabilities**, and **rich Markdown documentation** in a single dark-mode UI.

### Target Users

| User Type | Use Case |
|-----------|----------|
| **C++ Developers** | Prototype algorithms and test library snippets without a full CMake project |
| **Educators & Students** | Teach and learn C++ concepts in an interactive, cell-by-cell format |
| **Data Scientists** | Leverage C++ for high-performance computing tasks with a notebook workflow |

### Main Features

- **Interactive C++ Execution** — Real-time evaluation of C++17 code cells via `xeus-cling`.
- **Modern Glassy UI** — Polished, responsive, dark-mode-first React frontend.
- **Multi-User Workspaces** — Isolated filesystems and kernel registries per user (UUID-scoped).
- **Robust Authentication** — Stateless JWT auth with bcrypt password hashing.
- **Real-Time WebSocket Bridge** — Low-latency execution, stdin prompts, and kernel interrupts.
- **Persistent Storage** — PostgreSQL-backed user profiles; native filesystem notebook storage.
- **Kernel Multiplexing** — One C++ kernel per notebook, shared across multiple browser tabs.
- **Crash Recovery** — Automatic `kernel_died` detection with a one-click "Restart Kernel" UI button.

---

## 2. Architecture

CppNote employs a **three-tier client-server architecture** with a containerized microservices deployment model.

### System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                          │
│   React 18 + Vite │ CodeMirror 6 │ WebSocket Client           │
└────────────┬───────────────────────────────┬──────────────────┘
             │ HTTPS REST                     │ WSS
             ▼                                ▼
┌────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend (Uvicorn)                  │
│                                                                │
│  ┌─────────────────┐  ┌──────────────────────────────────┐    │
│  │   HTTP Routers  │  │       WebSocket Handlers          │    │
│  │  /api/auth      │  │  /ws/notebooks/{path}             │    │
│  │  /api/fs        │  └────────────────┬─────────────────┘    │
│  └────────┬────────┘                   │                       │
│           │                  ┌─────────▼──────────┐           │
│           │                  │   KernelRegistry    │           │
│           │                  │ (one kernel/file)   │           │
│           │                  └─────────┬──────────┘           │
└───────────┼────────────────────────────┼──────────────────────┘
            │ asyncpg                    │ ZMQ (Jupyter Protocol)
            ▼                            ▼
┌──────────────────┐        ┌─────────────────────────┐
│   PostgreSQL 15  │        │   xeus-cling (C++17)     │
│  (User profiles) │        │   Jupyter Kernel Process │
└──────────────────┘        └─────────────────────────┘
            ▲
            │ Docker Volume
┌──────────────────┐
│  /workspaces/    │
│  <user-uuid>/    │  ← Per-user isolated filesystem
└──────────────────┘
```

### Component Responsibilities

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| Frontend SPA | React 18 + Vite | UI rendering, notebook state, file tree, editor instances |
| Backend API | FastAPI + Uvicorn | HTTP routing, WebSocket lifecycle, business logic |
| Kernel Manager | `KernelRegistry` (custom) | Spawning, multiplexing, and monitoring `xeus-cling` processes |
| Database | PostgreSQL 15 + asyncpg | User identities, persistent metadata |
| Storage Volume | Docker Volume (`workspaces/`) | User-scoped file and notebook persistence |
| C++ Kernel | xeus-cling + Micromamba | JIT C++ interpretation via the Jupyter ZMQ protocol |

### Request Flow: Login → Execute → Stream Output

```mermaid
sequenceDiagram
    participant Browser
    participant FastAPI
    participant Postgres
    participant KernelRegistry
    participant xeus_cling

    Browser->>FastAPI: POST /api/auth/login {email, password}
    FastAPI->>Postgres: SELECT user WHERE email=? + bcrypt.verify()
    Postgres-->>FastAPI: User record
    FastAPI-->>Browser: { access_token: "eyJ..." }

    Browser->>FastAPI: GET /api/fs/list (Authorization: Bearer <token>)
    FastAPI-->>Browser: [ { name, path, type }, ... ]

    Browser->>FastAPI: WS /ws/notebooks/{path}?token=<jwt>
    FastAPI->>KernelRegistry: get_or_create(path)
    KernelRegistry->>xeus_cling: Spawn kernel process (ZMQ)
    KernelRegistry-->>FastAPI: KernelSession handle
    FastAPI-->>Browser: WebSocket 101 Switching Protocols

    Browser->>FastAPI: WS { type: "execute", cellId: "abc", source: "int x=5;" }
    FastAPI->>xeus_cling: execute_request (ZMQ frame)
    xeus_cling-->>FastAPI: stream (stdout/stderr) + execute_reply
    FastAPI-->>Browser: WS { type: "stream", cellId: "abc", text: "..." }
    FastAPI-->>Browser: WS { type: "execute_reply", cellId: "abc", status: "ok" }
```

---

## 3. Folder & File Structure

```
cppnote/
├── backend/                        # FastAPI Python backend
│   ├── app/
│   │   ├── api/                    # Route modules
│   │   │   ├── auth.py             # /api/auth/* endpoints (login, register, me)
│   │   │   ├── fs.py               # /api/fs/* endpoints (list, file CRUD)
│   │   │   └── notebooks.py        # /ws/notebooks/* WebSocket handler
│   │   ├── core/
│   │   │   └── config.py           # pydantic-settings: env var schema & defaults
│   │   ├── services/
│   │   │   ├── auth_service.py     # JWT creation/validation, bcrypt helpers
│   │   │   ├── kernel_registry.py  # KernelSession spawning & multiplexing logic
│   │   │   └── fs_service.py       # Workspace path resolution & I/O helpers
│   │   ├── main.py                 # FastAPI app factory, CORS, router registration
│   │   ├── models.py               # SQLAlchemy ORM table definitions
│   │   └── db.py                   # asyncpg engine, session factory, Alembic target
│   ├── tests/                      # pytest test suite
│   │   ├── test_auth.py
│   │   ├── test_fs.py
│   │   └── test_kernel.py
│   ├── Dockerfile                  # Micromamba + Python + xeus-cling image
│   └── requirements.txt            # Python package pins
│
├── frontend/                       # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Cell/               # CodeCell, MarkdownCell, OutputCell components
│   │   │   ├── FileTree/           # Sidebar file explorer
│   │   │   ├── Navbar/             # Top navigation & kernel status indicator
│   │   │   └── Editor/             # Monaco editor (heavy text file editing)
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts     # WebSocket lifecycle & reconnect logic
│   │   │   └── useKernel.ts        # Kernel status, interrupt, restart actions
│   │   ├── services/
│   │   │   ├── api.ts              # Axios REST client (auth interceptors)
│   │   │   └── ws.ts               # WebSocket message serialization layer
│   │   └── styles/
│   │       ├── global.css          # CSS resets, CSS custom properties
│   │       └── glassy.css          # Glassmorphism theme variables & keyframes
│   ├── package.json
│   └── vite.config.ts              # Proxy rules: /api → :8000, /ws → :8000
│
├── workspaces/                     # Runtime: per-user notebook file storage (gitignored)
│   └── <user-uuid>/
│       └── my-notebook.ipynb
│
├── .env.example                    # Environment variable template
├── docker-compose.yml              # Three-service orchestration (postgres, api, web)
├── start.sh                        # Convenience script: up --build + tail logs
└── README.md                       # This file
```

---

## 4. Technology Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.x | Component-based UI rendering |
| TypeScript | 5.x | Type-safe data flow across the app |
| Vite | 5.x | Dev server with HMR; optimised production builds |
| CodeMirror 6 | 6.x | Primary code editor for notebook cells (C++ syntax, keybindings) |
| Monaco Editor | Latest | Full IDE editor for heavy text files in the workspace |
| React Markdown + remark-gfm | Latest | Safe Markdown cell rendering with GFM table support |
| Lucide React | Latest | Consistent, lightweight iconography |

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| FastAPI | 0.115.x | High-performance async Python web framework |
| Uvicorn | Latest | ASGI server — handles concurrent HTTP + WebSocket |
| SQLAlchemy (Async) | 2.0.x | Modern async ORM for PostgreSQL interaction |
| Jupyter Client | 8.6.x | Speaks the Jupyter ZMQ wire protocol to `xeus-cling` |
| python-jose | Latest | JWT encoding and decoding (HS256) |
| bcrypt | Latest | Password salting and hashing |
| pydantic-settings | Latest | Type-safe environment variable parsing |

### Database & Kernel Infrastructure

| Technology | Purpose |
|-----------|---------|
| PostgreSQL 15 | ACID-compliant persistent storage for user data |
| xeus-cling | Native C++17 Jupyter kernel — interprets C++ without a compile step |
| Micromamba | Minimal conda-compatible package manager used inside Docker to install the kernel |

### DevOps

| Technology | Purpose |
|-----------|---------|
| Docker | Reproducible, isolated container images |
| Docker Compose | Three-service local orchestration with shared networking |

---

## 5. Dependencies

### Backend (`backend/requirements.txt`)

| Package | Pin | Why |
|---------|-----|-----|
| `fastapi` | `0.115.0` | Core web framework; chosen for native `async`/`await` and auto-generated OpenAPI |
| `uvicorn[standard]` | Latest | Production ASGI server with WebSocket support |
| `sqlalchemy[asyncio]` | `2.0.36` | Async ORM; `asyncio` extra enables `asyncpg` dialect |
| `asyncpg` | `0.30.0` | High-throughput async PostgreSQL wire driver |
| `jupyter-client` | `8.6.3` | ZMQ Jupyter protocol implementation for kernel management |
| `pydantic-settings` | Latest | Strongly typed `.env` → Python settings class |
| `python-jose[cryptography]` | Latest | HS256 JWT issuance and verification |
| `bcrypt` | Latest | One-way password hashing |
| `python-multipart` | Latest | Required by FastAPI for form data (file upload) |

### Frontend (`frontend/package.json`)

| Package | Why |
|---------|-----|
| `@uiw/react-codemirror` + `@codemirror/lang-cpp` | Primary notebook code cell editor with C++ language support |
| `@monaco-editor/react` | VS Code–grade editor for `.cpp` / `.h` files in the workspace view |
| `lucide-react` | Consistent SVG icon set |
| `react-markdown` + `remark-gfm` | Secure Markdown rendering for text cells |
| `axios` | HTTP REST client with interceptors for JWT injection |

---

## 6. Installation Guide

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker Desktop | 24.x+ | Required for all Docker paths |
| Docker Compose | V2 (built-in) | `docker compose` (no hyphen) preferred |
| Node.js | 20+ | Only needed for local frontend dev |
| Python | 3.12+ | Only needed for local backend dev |
| Micromamba | Latest | Only needed for local kernel installation |

### Option A — Docker Compose (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/your-org/cppnote.git
cd cppnote

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env: set CPPNOTE_JWT_SECRET to a long random string

# 3. Build and start all three containers in the background
docker-compose up --build -d

# 4. Follow logs to confirm all services are healthy
docker-compose logs -f
```

Once running, open http://localhost:5173.

### Option B — Local Development (Without Docker)

> **Note:** `xeus-cling` is only installable via conda/micromamba. The Docker path is strongly preferred.

```bash
# ── Backend ──────────────────────────────────────────────
cd backend

# Create and activate an isolated micromamba environment with the C++ kernel
micromamba create -n cppnote -c conda-forge python=3.12 xeus-cling
micromamba activate cppnote

# Install Python dependencies
pip install -r requirements.txt

# Start the backend (auto-reloads on code change)
uvicorn app.main:app --reload --port 8000

# ── Frontend (new terminal) ───────────────────────────────
cd frontend
npm install
npm run dev        # starts Vite dev server on http://localhost:5173
```

### Verify Installation

```bash
# Check all containers are up
docker-compose ps

# Quick smoke-test: login and get a token
curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cppnote.local","password":"cppnote123"}' \
  | python3 -m json.tool
```

---

## 7. Environment Variables

Create a `.env` file in the project root (copy from `.env.example`).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CPPNOTE_JWT_SECRET` | ✅ | — | Secret key for signing JWTs. Use a long random string in production. |
| `CPPNOTE_FRONTEND_ORIGIN` | ✅ | `http://localhost:5173` | Allowed CORS origin (must match your frontend URL). |
| `CPPNOTE_DATABASE_URL` | ✅ | — | Full asyncpg connection string. |
| `CPPNOTE_KERNEL_NAME` | ✅ | `xcpp17` | Jupyter kernel name registered by `xeus-cling`. |
| `CPPNOTE_WORKSPACE_ROOT` | ✅ | — | Absolute path on the host where user workspaces are stored. |
| `CPPNOTE_KERNEL_IDLE_TIMEOUT` | ❌ | `300` | Seconds before an idle kernel is shut down to free memory. |
| `CPPNOTE_USER_EMAIL` | ❌ | `admin@cppnote.local` | Seed user email created on first startup. |
| `CPPNOTE_USER_PASSWORD` | ❌ | `cppnote123` | Seed user password. **Change before any public deployment.** |
| `CPPNOTE_DISPLAY_NAME` | ❌ | `Developer` | Display name for the seed user. |

**Example `.env` file:**

```env
# Security
CPPNOTE_JWT_SECRET=replace-with-a-64-char-random-hex-string
CPPNOTE_FRONTEND_ORIGIN=http://localhost:5173

# Database
CPPNOTE_DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/cppnote

# Kernel
CPPNOTE_KERNEL_NAME=xcpp17
CPPNOTE_WORKSPACE_ROOT=/workspaces
CPPNOTE_KERNEL_IDLE_TIMEOUT=300

# Seed user (change in production)
CPPNOTE_USER_EMAIL=admin@cppnote.local
CPPNOTE_USER_PASSWORD=cppnote123
CPPNOTE_DISPLAY_NAME=Developer
```



---

## 8. Workflows

### 8.1 Authentication Flow

```
User submits login form
       │
       ▼
POST /api/auth/login { email, password }
       │
       ▼
FastAPI → asyncpg → SELECT * FROM users WHERE email = ?
       │
       ├── Not found ──→ HTTP 401 Unauthorized
       │
       ▼
bcrypt.verify(password, hashed_password)
       │
       ├── Mismatch ───→ HTTP 401 Unauthorized
       │
       ▼
python-jose: encode({ sub: user.id, exp: now + 24h }, JWT_SECRET)
       │
       ▼
HTTP 200 { access_token: "eyJ...", token_type: "bearer" }
       │
       ▼
Frontend stores token in memory / localStorage
All subsequent requests include: Authorization: Bearer <token>
```

### 8.2 Code Cell Execution Flow

1. **User action** — User writes C++ code in a CodeMirror cell and presses `Shift+Enter`.
2. **Serialization** — The frontend sends over the open WebSocket:
   ```json
   { "type": "execute", "cellId": "uuid-1234", "source": "std::cout << 42;" }
   ```
3. **Backend routing** — FastAPI receives the frame in `/ws/notebooks/{path}`.
4. **Session dispatch** — The payload is forwarded to the `KernelSession` mapped to that notebook path.
5. **ZMQ request** — `jupyter-client` packages a `execute_request` ZMQ frame and sends it to `xeus-cling`.
6. **JIT compilation** — `xeus-cling` interprets the C++ snippet, JIT-compiling it via Clang/LLVM.
7. **Stream output** — The kernel emits `stream` (stdout/stderr) ZMQ messages back to the backend.
8. **WebSocket broadcast** — The backend forwards each chunk to the browser:
   ```json
   { "type": "stream", "cellId": "uuid-1234", "name": "stdout", "text": "42" }
   ```
9. **UI update** — React appends the streamed output to the cell's output panel in real time.
10. **Completion signal** — Backend sends `{ "type": "execute_reply", "status": "ok" }` to close the execution cycle.

### 8.3 File System Workflow

```
User creates/renames/deletes a file in the sidebar
       │
       ▼
POST | DELETE /api/fs/file { path: "my-notebook.cpp" }
       │
       ▼
fs_service.resolve_safe_path(user.id, path)
  └── Prepends /workspaces/<user-uuid>/
  └── Rejects any path containing ".." → HTTP 403
       │
       ▼
Standard Python filesystem I/O (open / os.remove / os.makedirs)
       │
       ▼
HTTP 200 { success: true }
       │
       ▼
Frontend re-fetches GET /api/fs/list → sidebar re-renders
```

### 8.4 Kernel Lifecycle

```
Notebook opened          → KernelRegistry.get_or_create(path) → spawn xeus-cling process
Multiple tabs opened     → All tabs share the SAME KernelSession for that path
Browser tab closed       → WebSocket disconnected; idle timer starts (default 300s)
Idle timer expires       → Kernel process killed; RAM freed
Kernel segfaults/crashes → KernelRegistry detects exit; sends WS { type: "kernel_died" }
User clicks "Restart"    → KernelRegistry.restart(path) → new xeus-cling process spawned
```

---

## 9. Data Structures & Models

### 9.1 Database Schema (`app/models.py`)

```python
class User(Base):
    __tablename__ = "users"

    id            : str      # UUID primary key (auto-generated)
    email         : str      # Unique login email
    hashed_password: str     # bcrypt hash — plain text is NEVER stored
    display_name  : str      # Name shown in the UI
    bio           : str      # Optional user bio
    avatar_url    : str      # Relative path to profile picture (nullable)
    created_at    : datetime # UTC timestamp of account creation
```

**SQL equivalent:**

```sql
CREATE TABLE users (
    id              VARCHAR   PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR   UNIQUE NOT NULL,
    hashed_password VARCHAR   NOT NULL,
    display_name    VARCHAR   NOT NULL,
    bio             VARCHAR,
    avatar_url      VARCHAR,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 9.2 WebSocket Message Schemas

**Client → Server: Execute request**
```json
{
  "type":   "execute",
  "cellId": "uuid-1234",
  "source": "#include <iostream>\nint main() { std::cout << \"Hello, CppNote!\"; }"
}
```

**Client → Server: Interrupt kernel**
```json
{
  "type": "interrupt"
}
```

**Server → Client: Stream output**
```json
{
  "type":   "stream",
  "cellId": "uuid-1234",
  "name":   "stdout",
  "text":   "Hello, CppNote!"
}
```

**Server → Client: Execution complete**
```json
{
  "type":         "execute_reply",
  "cellId":       "uuid-1234",
  "status":       "ok",
  "execution_count": 5
}
```

**Server → Client: Kernel error**
```json
{
  "type":     "error",
  "cellId":   "uuid-1234",
  "ename":    "CompilationError",
  "evalue":   "use of undeclared identifier 'x'",
  "traceback": ["...clang error output..."]
}
```

**Server → Client: Kernel died**
```json
{
  "type":    "kernel_died",
  "reason":  "Kernel process exited with code -11 (SIGSEGV)"
}
```

### 9.3 REST Pydantic Schemas

```python
# Request
class LoginRequest(BaseModel):
    email:    EmailStr
    password: str

# Response
class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"

# File system entry
class FSEntry(BaseModel):
    name:     str
    path:     str
    type:     Literal["file", "directory"]
    size:     Optional[int]
    modified: Optional[datetime]
```

---

## 10. API Reference

Interactive Swagger UI is available at **`http://localhost:8000/docs`** when the backend is running.

### Authentication Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | ❌ | Create a new user account |
| `POST` | `/api/auth/login` | ❌ | Authenticate and receive a JWT |
| `GET` | `/api/auth/me` | ✅ | Fetch the current user's profile |

### File System Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/fs/list` | ✅ | List the user's workspace directory tree |
| `POST` | `/api/fs/file` | ✅ | Create or overwrite a file |
| `DELETE` | `/api/fs/file` | ✅ | Delete a file or directory |

### WebSocket Endpoint

| Protocol | Endpoint | Auth | Description |
|----------|----------|------|-------------|
| `WS` | `/ws/notebooks/{path}` | ✅ (query param `?token=`) | Bidirectional kernel execution channel |

### Example cURL Calls

**Register a new user:**
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"secret","display_name":"Dev"}'
```

**Login:**
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cppnote.local","password":"cppnote123"}'
# → { "access_token": "eyJ...", "token_type": "bearer" }
```

**List files (with token):**
```bash
curl http://localhost:8000/api/fs/list \
  -H "Authorization: Bearer eyJ..."
```

**Create a file:**
```bash
curl -X POST http://localhost:8000/api/fs/file \
  -H "Authorization: Bearer eyJ..." \
  -H "Content-Type: application/json" \
  -d '{"path":"hello.cpp","content":"#include <iostream>\nint main(){}"}'
```

---

## 11. Authentication & Security

### JWT Strategy

- Tokens are signed with `HS256` using `CPPNOTE_JWT_SECRET`.
- Tokens expire after **24 hours**.
- All protected routes validate the token via a FastAPI `Depends(get_current_user)` dependency.
- WebSocket auth: the JWT is passed as a query parameter (`?token=<jwt>`); the handshake is rejected with HTTP `401` if invalid.

### Password Security

- Plain-text passwords are **never stored or logged**.
- `bcrypt` handles salting and hashing with a cost factor of 12 (configurable).

### Workspace Isolation

- Every user's files live under `/workspaces/<user-uuid>/`.
- The `fs_service.resolve_safe_path()` function prepends the UUID prefix and **rejects any path containing `..`** with `HTTP 403 Forbidden`.
- There is no mechanism for one user to reference another's UUID directory.

### CORS Policy

- Allowed origins are strictly set to `CPPNOTE_FRONTEND_ORIGIN` (defaults to `localhost:5173`).
- In production, update this to your domain: e.g. `https://cppnote.yourdomain.com`.

---

## 12. Configuration

The backend is configured via `pydantic-settings` in `backend/app/core/config.py`. Environment variables are automatically mapped to Python fields with type validation.

```python
class Settings(BaseSettings):
    jwt_secret:             str
    frontend_origin:        str   = "http://localhost:5173"
    database_url:           str
    kernel_name:            str   = "xcpp17"
    workspace_root:         str
    kernel_idle_timeout:    int   = 300   # seconds
    user_email:             str   = "admin@cppnote.local"
    user_password:          str   = "cppnote123"
    display_name:           str   = "Developer"

    model_config = SettingsConfigDict(env_prefix="CPPNOTE_")
```

All field values can be overridden at runtime by setting the prefixed environment variable (e.g. `CPPNOTE_KERNEL_IDLE_TIMEOUT=600`).

---

## 13. Build & Deployment

### Docker Compose Services

The `docker-compose.yml` defines three interconnected services:

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| `postgres` | `postgres:15` | 5432 (internal) | Database with persistent `pgdata` volume |
| `api` | `backend/Dockerfile` | 8000 | FastAPI app; mounts local code for hot-reload in dev |
| `web` | `node:20-alpine` | 5173 | Vite dev server; proxies `/api` and `/ws` to `api:8000` |

### Useful Docker Commands

```bash
# Start everything
docker-compose up --build -d

# View live logs from the API
docker-compose logs -f api

# Stop all services
docker-compose down

# Destroy volumes (WARNING: deletes all user files and database data)
docker-compose down -v

# Rebuild only the backend after dependency changes
docker-compose up --build api
```

### Production Deployment

| Layer | Recommendation |
|-------|---------------|
| **Frontend** | Run `npm run build`, serve `/dist` via Nginx or deploy to Cloudflare Pages / Vercel |
| **Backend** | Run `gunicorn -k uvicorn.workers.UvicornWorker -w 4 app.main:app` |
| **Database** | Use a managed service: AWS RDS, Supabase, or Neon |
| **Workspace Storage** | Mount AWS EFS (or equivalent NFS) to `/workspaces` across backend pods |
| **Reverse Proxy** | Nginx or Caddy in front of both services; handle TLS termination |
| **Secrets** | Inject `CPPNOTE_JWT_SECRET` via Kubernetes Secrets or AWS SSM Parameter Store |

---

## 14. Testing

### Running Backend Tests

```bash
cd backend
pytest -v
```

### Test Categories

| Category | Files | What It Covers |
|----------|-------|----------------|
| **Unit** | `tests/test_auth.py` | JWT creation/validation, bcrypt hashing, path traversal rejection |
| **Integration** | `tests/test_fs.py` | REST endpoints against a live test database instance |
| **Kernel** | `tests/test_kernel.py` | ZMQ bridge: spawns `xeus-cling` and verifies `stdout` output |

### Running the Integration Smoke Test

```bash
# Ensure the backend is running, then:
bash test_endpoints.sh
```

---

## 15. Performance & Scalability

- **Async Core** — FastAPI + `asyncpg` prevent thread-blocking during network or DB I/O. A single Uvicorn process can handle hundreds of concurrent WebSocket connections.
- **Kernel Multiplexing** — `KernelRegistry` ensures only **one** `xeus-cling` process runs per notebook path, even when multiple browser tabs are subscribed. All WebSockets share the same event bus.
- **Lazy Loading** — Monaco Editor and other heavy React components are lazy-loaded (`React.lazy`) to keep the initial JS bundle small and TTI fast.
- **Connection Pooling** — `asyncpg` maintains a pool of database connections, avoiding the overhead of a new connection per request.

### Scaling Considerations

| Bottleneck | Mitigation |
|------------|-----------|
| `xeus-cling` is memory-heavy (~200–400 MB per kernel) | Set `CPPNOTE_KERNEL_IDLE_TIMEOUT` to aggressively reclaim memory |
| Single-node kernel registry doesn't scale horizontally | Replace `KernelRegistry` with a distributed worker queue (Celery + Redis) and Jupyter Enterprise Gateway |
| WebSocket connections are stateful | Use sticky sessions (Nginx `ip_hash`) when running multiple backend replicas |

---

## 16. Error Handling & Debugging

### Backend Logging

FastAPI emits structured ASGI logs via Uvicorn's default formatter. In development:

```bash
docker-compose logs -f api   # live stream
```

### Kernel Crash Recovery

When a user's C++ code causes a segfault or infinite loop that the kernel cannot recover from:

1. The `KernelRegistry` detects that the subprocess exited unexpectedly.
2. It sends `{ "type": "kernel_died" }` over all subscribed WebSockets.
3. The React UI shows a banner: **"Kernel died — click Restart to continue."**
4. The user clicks **Restart Kernel** → `KernelRegistry.restart(path)` spawns a fresh `xeus-cling` process.

### Common Error Codes

| HTTP Code | Cause |
|-----------|-------|
| `401 Unauthorized` | Missing, expired, or invalid JWT |
| `403 Forbidden` | Path traversal attempt (`..` in file path) |
| `404 Not Found` | Requested file or endpoint does not exist |
| `422 Unprocessable Entity` | Request body failed Pydantic validation |
| `500 Internal Server Error` | Unhandled exception — check `docker-compose logs api` |

---

## 17. Troubleshooting

### Containers won't start

```bash
docker-compose logs postgres   # check for database init errors
docker-compose logs api        # look for missing env vars or import errors
```

**Common cause:** `CPPNOTE_DATABASE_URL` is wrong. Ensure the hostname is `postgres` (the Docker Compose service name), not `localhost`.

### "Database does not exist" error

```bash
# Connect to the postgres container and create the DB manually
docker-compose exec postgres psql -U postgres -c "CREATE DATABASE cppnote;"
```

### Kernel takes forever to start

The first time a kernel is spawned, `xeus-cling` needs to compile internal headers. This is a one-time warm-up of **10–30 seconds**. Subsequent cell executions are nearly instantaneous.

### Frontend cannot connect to backend

Check `vite.config.ts` — the proxy must point to `http://api:8000` (Docker network) or `http://localhost:8000` (local dev). Also confirm `CPPNOTE_FRONTEND_ORIGIN` matches your frontend URL exactly.

### Hot reload not working in Docker

Ensure your `docker-compose.yml` mounts the local source directory as a volume for both `api` and `web` services, and that Vite's `server.watch.usePolling: true` is set in `vite.config.ts` (required on some host OS/filesystem combinations).

---

## 18. Developer Experience

### Code Style

| Layer | Tooling |
|-------|---------|
| Backend | PEP-8 enforced via `flake8`; auto-formatted with `black` |
| Frontend | ESLint + Prettier; enforced via `npm run lint` |

### Recommended IDE Setup

**VSCode** is highly recommended. Install:
- `Python` extension → select the `micromamba` interpreter for the `cppnote` environment.
- `Pylance` → full type-checking for the FastAPI backend.
- `ESLint` + `Prettier` → auto-format on save for the frontend.
- `Docker` extension → manage containers without leaving the editor.

### Useful Dev Scripts

```bash
# Format backend code
cd backend && black app/

# Lint frontend
cd frontend && npm run lint

# Type-check frontend
cd frontend && npm run type-check

# Reset database (drops and recreates schema)
docker-compose down -v && docker-compose up --build -d
```

---

## 19. Contribution Guide

We welcome contributions of all kinds — bug fixes, new features, documentation improvements, and test coverage.

### Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/cppnote.git
   ```
3. **Create a feature branch:**
   ```bash
   git checkout -b feature/my-amazing-feature
   ```
4. **Make your changes**, following the code style guidelines in §18.
5. **Run the tests** to confirm nothing is broken:
   ```bash
   cd backend && pytest -v
   cd frontend && npm run lint
   ```
6. **Commit** with a clear, imperative message:
   ```bash
   git commit -m "feat: add kernel interrupt timeout config option"
   ```
7. **Push** your branch and open a **Pull Request** against `main`.

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org):

| Prefix | When to use |
|--------|-------------|
| `feat:` | A new feature |
| `fix:` | A bug fix |
| `docs:` | Documentation changes only |
| `refactor:` | Code change that neither fixes a bug nor adds a feature |
| `test:` | Adding or updating tests |
| `chore:` | Build system, CI, dependency updates |

---

## 20. Roadmap

### Completed ✅

- [x] Multi-user file isolation (UUID-scoped workspaces)
- [x] WebSocket Kernel Bridge (ZMQ ↔ WebSocket relay)
- [x] React glassy dark-mode interface
- [x] JWT authentication with bcrypt password hashing
- [x] Kernel crash detection and one-click restart

### In Progress 🔄

- [ ] **C++20 standard support** — upgrade `xeus-cling` to a C++20-capable Clang version.
- [ ] **Notebook export** — download notebooks as `.ipynb` or rendered HTML.

### Planned 📋

- [ ] **Distributed kernel execution** — replace `KernelRegistry` with Celery + Redis + Jupyter Enterprise Gateway for horizontal scaling.
- [ ] **Real-time collaborative editing** — CRDT integration via [Yjs](https://yjs.dev) for multi-user live sessions.
- [ ] **Variable inspector** — sidebar panel showing current C++ variable names, types, and values after each cell execution.
- [ ] **CMake project mode** — support for multi-file projects with a build panel alongside the notebook.
- [ ] **Dark/light theme toggle** — configurable UI theme preference per user.

---

## 21. FAQ

**Q: Can I use standard library headers like `<vector>`, `<map>`, or `<algorithm>`?**
A: Yes. `xeus-cling` interprets all standard C++17 headers seamlessly. Just `#include` them at the top of any cell.

**Q: Why does the kernel take several seconds to respond on the very first cell execution?**
A: On first use, `xeus-cling` JIT-compiles a set of internal standard library headers. This warm-up happens once per kernel session. All subsequent executions are nearly instantaneous.

**Q: Are my files private from other users?**
A: Yes. Every API request and filesystem operation is scoped to `/workspaces/<your-uuid>/`. Any attempt to traverse out of this directory is rejected with `HTTP 403`. Other users' UUIDs are never exposed in any API response.

**Q: My kernel crashed from an infinite loop. How do I recover?**
A: Click the **Restart Kernel** button in the notebook toolbar. This terminates the crashed process and spawns a fresh `xeus-cling` instance. You will need to re-execute any cells that had stateful side effects.

**Q: Can I run CppNote without Docker?**
A: Yes, but it requires manually installing `xeus-cling` via `micromamba`. See [§6 Option B](#option-b--local-development-without-docker). Docker is strongly recommended for a consistent environment.

**Q: How do I change the default admin password before deploying?**
A: Set `CPPNOTE_USER_PASSWORD` to a strong value in your `.env` file before the first `docker-compose up`. If the seed user was already created with the default password, delete the user row in PostgreSQL and restart to re-seed.

---

<div align="center">

Made with ❤️ for the C++ community

[Report a Bug](https://github.com/your-org/cppnote/issues) · [Request a Feature](https://github.com/your-org/cppnote/issues) · [Discussions](https://github.com/your-org/cppnote/discussions)

</div>
