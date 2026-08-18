# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local-only ComfyUI prompt-management tool: FastAPI + SQLite backend, React/Vite/Tailwind frontend. Full details (schema, API reference, migration script behavior, deviations from the original design spec, known limitations) are in `docs/実装ドキュメント.md` — read it before making non-trivial changes. `docs/使い方マニュアル.md` is a non-technical user manual, not relevant to development. `README.md` has the same setup/run instructions as below plus directory layout.

## Commands

Backend setup:
```bash
cd backend
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
```
Do not pin `pydantic`/`pydantic-core` to older versions than what's in `requirements.txt` — this repo runs on Python 3.14, and older pydantic-core releases have no prebuilt wheel for it, forcing a Rust source build that fails without MSVC build tools.

Run backend: `venv\Scripts\python.exe -m uvicorn app.main:app --port 8000` (from `backend/`)

Frontend: `npm install`, then `npm run dev` (Vite dev server), `npm run build` (`tsc -b && vite build`), `npm run lint` (`oxlint`) — all from `frontend/`.

One-shot launch: double-click `起動.bat` at repo root — starts both servers and opens the browser.

Run the JSON→SQLite migration (idempotent — upsert by `pool+name`, safe to rerun after editing `import_data/axes/**/*.json`):
```bash
cd backend
venv\Scripts\python.exe -m app.migrate.migrate_json
```
Results (conflict/warning log) go to `backend/migration_log.txt` (gitignored).

**No test suite exists in this repo** (frontend or backend). Don't invent `pytest`/test commands.

## Architecture

Two independent processes: FastAPI on `:8000`, Vite dev server on `:5173` proxying `/api/*` → `:8000` (see `frontend/vite.config.ts`).

**Data model** (`backend/app/models.py`): `pool` is a registry concept via a `pools` table (a deliberate addition beyond the original design doc, so pools aren't hardcoded) rather than a plain string enum. `items.type` is `'part'` or `'finished'`. `groups` are flat, per-pool collections wired to items via `item_group_links` (many-to-many). `item_links` is a cross-pool "related items" graph (undirected — always stored with `item_id_a < item_id_b`, see `routers/items.py::add_link`). `finished_from_parts` records provenance when a `finished` item is composed from `part` items via the "compose from parts" flow. `prompt_manager.db` is the real data store and **is tracked in git** (not a build artifact — it's the "正データ" per the original design doc, source-of-truth for user edits made through the UI, not just a regenerable cache of the JSON import).

**Migration** (`backend/app/migrate/migrate_json.py`) has no generic JSON importer — each pool's JSON shape gets its own function because the shapes are genuinely different: `character` (name → `{positive,negative,lora}`), `expression`/`composition` word-banks (category → `[words]`, each word becomes its own `part` item), `expression`'s finished-presets file (name → `[variant strings]`, becomes one `finished` item with those variants). Adding a new pool from JSON means picking the closest existing pattern and adapting it, not extending a shared importer.

**Frontend** has no state-management library — each screen in `frontend/src/screens/` owns its own fetch/useState logic directly against `frontend/src/api/client.ts`. The trickiest piece of frontend logic is the prompt-builder's live-sync behavior (chip add/remove ↔ textarea text, LoRA strength slider ↔ `<lora:name:strength>` tag in the positive prompt), centralized in `frontend/src/utils/promptText.ts` and consumed by `frontend/src/screens/PromptBuilder.tsx` — changes to one almost always need to consider the other.
