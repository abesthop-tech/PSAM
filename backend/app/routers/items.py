import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/items", tags=["items"])

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "items"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _item_to_detail(db: Session, item: models.Item) -> schemas.ItemDetailOut:
    group_ids = list(
        db.scalars(
            select(models.ItemGroupLink.group_id).where(models.ItemGroupLink.item_id == item.id)
        )
    )
    linked_ids = list(
        db.scalars(
            select(models.ItemLink.item_id_b).where(models.ItemLink.item_id_a == item.id)
        )
    ) + list(
        db.scalars(
            select(models.ItemLink.item_id_a).where(models.ItemLink.item_id_b == item.id)
        )
    )
    out = schemas.ItemDetailOut.model_validate(item)
    out.group_ids = group_ids
    out.linked_item_ids = linked_ids
    return out


@router.get("", response_model=list[schemas.ItemOut])
def list_items(
    pool: str | None = None,
    type: str | None = None,
    group_id: int | None = None,
    ungrouped: bool = False,
    search: str | None = None,
    sort: Literal["name", "created", "updated", "used"] = "name",
    order: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
):
    stmt = select(models.Item)
    if pool:
        stmt = stmt.where(models.Item.pool == pool)
    if type:
        stmt = stmt.where(models.Item.type == type)
    if group_id is not None:
        stmt = stmt.join(
            models.ItemGroupLink, models.ItemGroupLink.item_id == models.Item.id
        ).where(models.ItemGroupLink.group_id == group_id)
    if ungrouped:
        stmt = stmt.where(
            ~select(models.ItemGroupLink.item_id)
            .where(models.ItemGroupLink.item_id == models.Item.id)
            .exists()
        )
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            or_(
                models.Item.name.ilike(like),
                models.Item.positive.ilike(like),
                models.Item.negative.ilike(like),
            )
        )
    sort_column = {
        "name": models.Item.name,
        "created": models.Item.created_at,
        "updated": models.Item.updated_at,
        "used": models.Item.last_used_at,
    }[sort]
    col = sort_column.asc() if order == "asc" else sort_column.desc()
    if sort == "used":
        col = col.nulls_last()
    if sort == "name":
        stmt = stmt.order_by(models.Item.pool, col)
    else:
        stmt = stmt.order_by(col)
    return db.scalars(stmt).unique().all()


@router.get("/{item_id}", response_model=schemas.ItemDetailOut)
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.Item, item_id)
    if not item:
        raise HTTPException(404, "アイテムが見つかりません")
    return _item_to_detail(db, item)


def _check_unique_name(db: Session, pool: str, name: str, exclude_id: int | None = None):
    stmt = select(models.Item).where(models.Item.pool == pool, models.Item.name == name)
    if exclude_id is not None:
        stmt = stmt.where(models.Item.id != exclude_id)
    if db.scalars(stmt).first():
        raise HTTPException(400, f"同じプール内に同名のアイテム「{name}」が既に存在します")


@router.post("", response_model=schemas.ItemDetailOut)
def create_item(payload: schemas.ItemCreate, db: Session = Depends(get_db)):
    if not db.get(models.Pool, payload.pool):
        raise HTTPException(400, "指定されたプールが存在しません")
    _check_unique_name(db, payload.pool, payload.name)

    data = payload.model_dump(exclude={"variants", "group_ids"})
    item = models.Item(**data)
    db.add(item)
    db.flush()

    variants = payload.variants or [schemas.VariantCreate(variant_text=payload.positive or "", sort_order=0)]
    for i, v in enumerate(variants):
        db.add(models.ItemVariant(item_id=item.id, variant_text=v.variant_text, sort_order=v.sort_order or i))

    for gid in payload.group_ids:
        if db.get(models.Group, gid):
            db.add(models.ItemGroupLink(item_id=item.id, group_id=gid))

    db.commit()
    db.refresh(item)
    return _item_to_detail(db, item)


@router.put("/{item_id}", response_model=schemas.ItemDetailOut)
def update_item(item_id: int, payload: schemas.ItemUpdate, db: Session = Depends(get_db)):
    item = db.get(models.Item, item_id)
    if not item:
        raise HTTPException(404, "アイテムが見つかりません")
    updates = payload.model_dump(exclude_unset=True)
    new_pool = updates.get("pool", item.pool)
    new_name = updates.get("name", item.name)
    if new_pool != item.pool and not db.get(models.Pool, new_pool):
        raise HTTPException(400, "指定されたプールが存在しません")
    if (new_pool, new_name) != (item.pool, item.name):
        _check_unique_name(db, new_pool, new_name, exclude_id=item.id)
    for field, value in updates.items():
        setattr(item, field, value)
    if updates:
        item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return _item_to_detail(db, item)


@router.delete("/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.Item, item_id)
    if not item:
        raise HTTPException(404, "アイテムが見つかりません")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/{item_id}/touch", response_model=schemas.ItemDetailOut)
def touch_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.Item, item_id)
    if not item:
        raise HTTPException(404, "アイテムが見つかりません")
    item.last_used_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return _item_to_detail(db, item)


@router.post("/{item_id}/image", response_model=schemas.ItemDetailOut)
def upload_item_image(item_id: int, file: UploadFile, db: Session = Depends(get_db)):
    item = db.get(models.Item, item_id)
    if not item:
        raise HTTPException(404, "アイテムが見つかりません")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(400, "対応していない画像形式です(jpg/jpeg/png/webpのみ)")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{item_id}_{int(time.time() * 1000)}{ext}"
    dest = UPLOAD_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    item.image_path = f"/uploads/items/{filename}"
    db.commit()
    db.refresh(item)
    return _item_to_detail(db, item)


# ---------- variants ----------
@router.post("/{item_id}/variants", response_model=schemas.VariantOut)
def add_variant(item_id: int, payload: schemas.VariantCreate, db: Session = Depends(get_db)):
    if not db.get(models.Item, item_id):
        raise HTTPException(404, "アイテムが見つかりません")
    variant = models.ItemVariant(item_id=item_id, **payload.model_dump())
    db.add(variant)
    db.commit()
    db.refresh(variant)
    return variant


@router.put("/{item_id}/variants/{variant_id}", response_model=schemas.VariantOut)
def update_variant(item_id: int, variant_id: int, payload: schemas.VariantCreate, db: Session = Depends(get_db)):
    variant = db.get(models.ItemVariant, variant_id)
    if not variant or variant.item_id != item_id:
        raise HTTPException(404, "バリエーションが見つかりません")
    for field, value in payload.model_dump().items():
        setattr(variant, field, value)
    db.commit()
    db.refresh(variant)
    return variant


@router.delete("/{item_id}/variants/{variant_id}")
def delete_variant(item_id: int, variant_id: int, db: Session = Depends(get_db)):
    variant = db.get(models.ItemVariant, variant_id)
    if not variant or variant.item_id != item_id:
        raise HTTPException(404, "バリエーションが見つかりません")
    remaining = db.scalars(
        select(models.ItemVariant).where(models.ItemVariant.item_id == item_id)
    ).all()
    if len(remaining) <= 1:
        raise HTTPException(400, "アイテムは最低1つのバリエーションが必要です")
    db.delete(variant)
    db.commit()
    return {"ok": True}


# ---------- groups membership ----------
@router.post("/{item_id}/groups/{group_id}")
def add_to_group(item_id: int, group_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Item, item_id):
        raise HTTPException(404, "アイテムが見つかりません")
    if not db.get(models.Group, group_id):
        raise HTTPException(404, "グループが見つかりません")
    existing = db.get(models.ItemGroupLink, (item_id, group_id))
    if not existing:
        db.add(models.ItemGroupLink(item_id=item_id, group_id=group_id))
        db.commit()
    return {"ok": True}


@router.delete("/{item_id}/groups/{group_id}")
def remove_from_group(item_id: int, group_id: int, db: Session = Depends(get_db)):
    link = db.get(models.ItemGroupLink, (item_id, group_id))
    if link:
        db.delete(link)
        db.commit()
    return {"ok": True}


# ---------- cross-pool links ----------
@router.post("/{item_id}/links")
def add_link(item_id: int, payload: schemas.ItemLinkCreate, db: Session = Depends(get_db)):
    other_id = payload.other_item_id
    if item_id == other_id:
        raise HTTPException(400, "自分自身にはリンクできません")
    if not db.get(models.Item, item_id) or not db.get(models.Item, other_id):
        raise HTTPException(404, "アイテムが見つかりません")
    a, b = sorted([item_id, other_id])
    if not db.get(models.ItemLink, (a, b)):
        db.add(models.ItemLink(item_id_a=a, item_id_b=b))
        db.commit()
    return {"ok": True}


@router.delete("/{item_id}/links/{other_id}")
def remove_link(item_id: int, other_id: int, db: Session = Depends(get_db)):
    a, b = sorted([item_id, other_id])
    link = db.get(models.ItemLink, (a, b))
    if link:
        db.delete(link)
        db.commit()
    return {"ok": True}


# ---------- compose finished from parts ----------
@router.post("/compose-finished", response_model=schemas.ItemDetailOut)
def compose_finished(payload: schemas.ComposeFinishedRequest, db: Session = Depends(get_db)):
    if not db.get(models.Pool, payload.pool):
        raise HTTPException(400, "指定されたプールが存在しません")
    if not payload.part_item_ids:
        raise HTTPException(400, "元になるpartを1つ以上選択してください")
    parts = [db.get(models.Item, pid) for pid in payload.part_item_ids]
    if any(p is None for p in parts):
        raise HTTPException(404, "存在しないアイテムが含まれています")
    _check_unique_name(db, payload.pool, payload.name)

    positive = payload.separator.join(p.positive.strip() for p in parts if p.positive.strip())
    item = models.Item(
        pool=payload.pool,
        type="finished",
        name=payload.name,
        positive=positive,
        negative=payload.negative,
        memo=payload.memo,
        image_path=payload.image_path,
    )
    db.add(item)
    db.flush()
    db.add(models.ItemVariant(item_id=item.id, variant_text=positive, sort_order=0))
    for p in parts:
        db.add(models.FinishedFromPart(finished_item_id=item.id, part_item_id=p.id))
    for gid in payload.group_ids:
        if db.get(models.Group, gid):
            db.add(models.ItemGroupLink(item_id=item.id, group_id=gid))
    db.commit()
    db.refresh(item)
    return _item_to_detail(db, item)


@router.get("/{item_id}/source-parts", response_model=list[schemas.ItemOut])
def get_source_parts(item_id: int, db: Session = Depends(get_db)):
    part_ids = db.scalars(
        select(models.FinishedFromPart.part_item_id).where(
            models.FinishedFromPart.finished_item_id == item_id
        )
    ).all()
    if not part_ids:
        return []
    return db.scalars(select(models.Item).where(models.Item.id.in_(part_ids))).all()
