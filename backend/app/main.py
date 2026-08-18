from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models
from .database import Base, engine
from .routers import db_viewer, export, groups, items, pools

Base.metadata.create_all(bind=engine)

app = FastAPI(title="ComfyUI Prompt Manager")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pools.router)
app.include_router(items.router)
app.include_router(groups.router)
app.include_router(db_viewer.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
