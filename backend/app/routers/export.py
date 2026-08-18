from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/export", tags=["export"])


def _item_to_json(item: models.Item) -> dict:
    entry = {
        "positive": item.positive,
        "negative": item.negative,
        "lora": item.lora_name,
    }
    if item.memo:
        entry["memo"] = item.memo
    return entry


@router.get("/pools/{pool}")
def export_pool(pool: str, db: Session = Depends(get_db)):
    if not db.get(models.Pool, pool):
        raise HTTPException(404, "プールが見つかりません")
    items = db.scalars(
        select(models.Item).where(models.Item.pool == pool).order_by(models.Item.name)
    ).all()
    return {item.name: _item_to_json(item) for item in items}


@router.get("/groups/{group_id}")
def export_group(group_id: int, db: Session = Depends(get_db)):
    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(404, "グループが見つかりません")
    stmt = (
        select(models.Item)
        .join(models.ItemGroupLink, models.ItemGroupLink.item_id == models.Item.id)
        .where(models.ItemGroupLink.group_id == group_id)
        .order_by(models.Item.name)
    )
    items = db.scalars(stmt).unique().all()
    return {item.name: _item_to_json(item) for item in items}
