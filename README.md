# CppNote

CppNote is a web-based C++ notebook built around a true kernel model instead of stitched cell recompilation. The initial scaffold in this repository uses a Jupyter-compatible execution protocol with `xeus-cling` as the recommended C++ kernel, a FastAPI backend for auth/notebook APIs and live kernel streaming, and a React frontend for the notebook experience.

## Why this rebuild uses a kernel

The core requirement is persistent execution state across cells. A kernel-based design gives us:

- Long-lived interpreter state for variables, functions, classes, and includes.
- Real-time stdout/stderr streaming over WebSockets.
- Interactive `stdin` via Jupyter `input_request` messages.
- Graceful interrupt and restart controls.
- Rich display payloads for images and plots.

## Project layout

```text
backend/   FastAPI API, auth, notebook persistence, kernel session manager
frontend/  React + TypeScript notebook UI
docs/      Architecture notes
```

## Recommended runtime strategy

- Development: run a local `xeus-cling` kernel installed in the backend environment.
- Production: switch the kernel runtime implementation to a per-user container launcher for stronger tenant isolation.

### Windows note

If you are developing on Windows, prefer WSL Ubuntu for the kernel runtime. `xeus-cling` is officially packaged for Linux and macOS, not native Windows. See [docs/wsl-xcpp17-setup.md](docs/wsl-xcpp17-setup.md).

## Local setup

### Backend

1. Create a Python virtual environment.
2. Install [backend/requirements.txt](backend/requirements.txt).
3. Ensure a Jupyter C++ kernel is available, ideally `xeus-cling`.
4. Start the API:

```bash
uvicorn app.main:app --reload
```

### Frontend

1. Install [frontend/package.json](frontend/package.json) dependencies.
2. Start the Vite dev server:

```bash
npm run dev
```

## Kernel configuration

The backend expects a Jupyter kernel name. By default it uses `xcpp17`, but you can override it with `CPPNOTE_KERNEL_NAME`.

## WSL bootstrap

For Windows machines, the fastest supported path to `xcpp17` is:

```bash
bash scripts/wsl/bootstrap_cppnote.sh
```

This uses [backend/environment.xcpp17.yml](backend/environment.xcpp17.yml) and runs [backend/scripts/kernel_smoke_test.py](backend/scripts/kernel_smoke_test.py) to prove cross-cell state before you open the UI.

## What this scaffold includes

- JWT auth endpoints and user profile update hooks.
- Notebook and cell persistence models.
- Upload storage for per-user notebook workspaces.
- WebSocket execution channel for streaming kernel events.
- Notebook UI with Markdown/code cells, reordering, run controls, and inline stdin prompts.

## What still needs real environment work

- Installing `xeus-cling` in the target environment.
- Enabling production-grade tenant isolation with per-session containers.
- Adding migrations, tests, and object storage for profile images/uploads.
- Hardening upload limits, rate limits, and container sandbox policies.

See [docs/architecture.md](docs/architecture.md) for the system design.
