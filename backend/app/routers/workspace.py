import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api", tags=["workspace"])


def _set_out(row: models.PromptSet) -> schemas.PromptSetOut:
    try:
        entries = json.loads(row.entries_json)
    except (TypeError, json.JSONDecodeError):
        entries = []
    return schemas.PromptSetOut(
        id=row.id, name=row.name, memo=row.memo, positive=row.positive,
        negative=row.negative, entries=entries,
        created_at=row.created_at, updated_at=row.updated_at,
    )


@router.get("/favorites", response_model=list[int])
def list_favorites(db: Session = Depends(get_db)):
    return list(db.scalars(select(models.FavoriteItem.item_id)))


@router.put("/favorites/{item_id}")
def add_favorite(item_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Item, item_id):
        raise HTTPException(404, "アイテムが見つかりません")
    if not db.get(models.FavoriteItem, item_id):
        db.add(models.FavoriteItem(item_id=item_id))
        db.commit()
    return {"ok": True}


@router.delete("/favorites/{item_id}")
def remove_favorite(item_id: int, db: Session = Depends(get_db)):
    favorite = db.get(models.FavoriteItem, item_id)
    if favorite:
        db.delete(favorite)
        db.commit()
    return {"ok": True}


@router.get("/prompt-sets", response_model=list[schemas.PromptSetOut])
def list_prompt_sets(db: Session = Depends(get_db)):
    rows = db.scalars(select(models.PromptSet).order_by(models.PromptSet.updated_at.desc())).all()
    return [_set_out(row) for row in rows]


@router.post("/prompt-sets", response_model=schemas.PromptSetOut)
def save_prompt_set(payload: schemas.PromptSetCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "セット名を入力してください")
    row = db.scalars(select(models.PromptSet).where(models.PromptSet.name == name)).first()
    now = datetime.now(timezone.utc)
    if row is None:
        row = models.PromptSet(name=name, created_at=now, updated_at=now)
        db.add(row)
    row.memo = payload.memo
    row.positive = payload.positive
    row.negative = payload.negative
    row.entries_json = json.dumps(payload.entries, ensure_ascii=False)
    row.updated_at = now
    db.commit()
    db.refresh(row)
    return _set_out(row)


@router.delete("/prompt-sets/{set_id}")
def delete_prompt_set(set_id: int, db: Session = Depends(get_db)):
    row = db.get(models.PromptSet, set_id)
    if not row:
        raise HTTPException(404, "プロンプトセットが見つかりません")
    db.delete(row)
    db.commit()
    return {"ok": True}
