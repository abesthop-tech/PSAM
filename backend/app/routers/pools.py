from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/pools", tags=["pools"])


@router.get("", response_model=list[schemas.PoolOut])
def list_pools(db: Session = Depends(get_db)):
    return db.scalars(select(models.Pool).order_by(models.Pool.sort_order, models.Pool.key)).all()


@router.post("", response_model=schemas.PoolOut)
def create_pool(payload: schemas.PoolCreate, db: Session = Depends(get_db)):
    if db.get(models.Pool, payload.key):
        raise HTTPException(400, "同じキーのプールが既に存在します")
    pool = models.Pool(**payload.model_dump())
    db.add(pool)
    db.commit()
    db.refresh(pool)
    return pool


@router.patch("/{key}", response_model=schemas.PoolOut)
def update_pool(key: str, payload: schemas.PoolUpdate, db: Session = Depends(get_db)):
    pool = db.get(models.Pool, key)
    if not pool:
        raise HTTPException(404, "プールが見つかりません")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(pool, field, value)
    db.commit()
    db.refresh(pool)
    return pool


@router.delete("/{key}")
def delete_pool(key: str, db: Session = Depends(get_db)):
    pool = db.get(models.Pool, key)
    if not pool:
        raise HTTPException(404, "プールが見つかりません")
    item_count = db.scalar(select(models.Item).where(models.Item.pool == key).limit(1))
    group_count = db.scalar(select(models.Group).where(models.Group.pool == key).limit(1))
    if item_count or group_count:
        raise HTTPException(400, "アイテムまたはグループが存在するプールは削除できません")
    db.delete(pool)
    db.commit()
    return {"ok": True}
