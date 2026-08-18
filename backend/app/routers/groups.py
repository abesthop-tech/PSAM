from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.get("", response_model=list[schemas.GroupOut])
def list_groups(pool: str | None = None, search: str | None = None, db: Session = Depends(get_db)):
    stmt = select(
        models.Group,
        func.count(models.ItemGroupLink.item_id).label("item_count"),
    ).outerjoin(models.ItemGroupLink, models.ItemGroupLink.group_id == models.Group.id)
    if pool:
        stmt = stmt.where(models.Group.pool == pool)
    if search:
        stmt = stmt.where(models.Group.name.ilike(f"%{search}%"))
    stmt = stmt.group_by(models.Group.id).order_by(models.Group.name)
    rows = db.execute(stmt).all()
    results = []
    for group, item_count in rows:
        out = schemas.GroupOut.model_validate(group)
        out.item_count = item_count
        results.append(out)
    return results


@router.post("", response_model=schemas.GroupOut)
def create_group(payload: schemas.GroupCreate, db: Session = Depends(get_db)):
    if not db.get(models.Pool, payload.pool):
        raise HTTPException(400, "指定されたプールが存在しません")
    existing = db.scalars(
        select(models.Group).where(models.Group.pool == payload.pool, models.Group.name == payload.name)
    ).first()
    if existing:
        raise HTTPException(400, "同じプール内に同名のグループが既に存在します")
    group = models.Group(**payload.model_dump())
    db.add(group)
    db.commit()
    db.refresh(group)
    out = schemas.GroupOut.model_validate(group)
    out.item_count = 0
    return out


@router.put("/{group_id}", response_model=schemas.GroupOut)
def update_group(group_id: int, payload: schemas.GroupUpdate, db: Session = Depends(get_db)):
    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(404, "グループが見つかりません")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    db.commit()
    db.refresh(group)
    item_count = db.scalar(
        select(func.count(models.ItemGroupLink.item_id)).where(models.ItemGroupLink.group_id == group_id)
    )
    out = schemas.GroupOut.model_validate(group)
    out.item_count = item_count or 0
    return out


@router.delete("/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(404, "グループが見つかりません")
    db.delete(group)
    db.commit()
    return {"ok": True}


@router.get("/{group_id}/items", response_model=list[schemas.ItemOut])
def get_group_items(group_id: int, db: Session = Depends(get_db)):
    stmt = (
        select(models.Item)
        .join(models.ItemGroupLink, models.ItemGroupLink.item_id == models.Item.id)
        .where(models.ItemGroupLink.group_id == group_id)
        .order_by(models.Item.name)
    )
    return db.scalars(stmt).unique().all()


@router.post("/{group_id}/items")
def add_items_to_group(group_id: int, payload: schemas.GroupItemsAdd, db: Session = Depends(get_db)):
    group = db.get(models.Group, group_id)
    if not group:
        raise HTTPException(404, "グループが見つかりません")
    for item_id in payload.item_ids:
        if db.get(models.Item, item_id) and not db.get(models.ItemGroupLink, (item_id, group_id)):
            db.add(models.ItemGroupLink(item_id=item_id, group_id=group_id))
    db.commit()
    return {"ok": True}


@router.delete("/{group_id}/items/{item_id}")
def remove_item_from_group(group_id: int, item_id: int, db: Session = Depends(get_db)):
    link = db.get(models.ItemGroupLink, (item_id, group_id))
    if link:
        db.delete(link)
        db.commit()
    return {"ok": True}
