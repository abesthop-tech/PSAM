from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import models
from .database import Base, engine
from .routers import db_viewer, export, groups, items, pools

Base.metadata.create_all(bind=engine)

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"
UPLOAD_ROOT.mkdir(exist_ok=True)

app = FastAPI(title="ComfyUI Prompt Manager")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

app.include_router(pools.router)
app.include_router(items.router)
app.include_router(groups.router)
app.include_router(db_viewer.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
