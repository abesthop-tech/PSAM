import math

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/db", tags=["db_viewer"])

TABLES = [
    "pools",
    "items",
    "item_variants",
    "groups",
    "item_group_links",
    "item_links",
    "finished_from_parts",
    "aliases",
    "pool_config",
]


@router.get("/tables")
def list_tables():
    return TABLES


def _item_name(db: Session, item_id: int | None) -> str | None:
    if item_id is None:
        return None
    item = db.get(models.Item, item_id)
    return item.name if item else f"(削除済み #{item_id})"


def _pool_name(db: Session, key: str | None) -> str | None:
    if key is None:
        return None
    pool = db.get(models.Pool, key)
    return pool.display_name if pool else key


def _group_name(db: Session, group_id: int | None) -> str | None:
    if group_id is None:
        return None
    group = db.get(models.Group, group_id)
    return group.name if group else f"(削除済み #{group_id})"


def _row_to_dict(row, columns: list[str]) -> dict:
    return {c: getattr(row, c) for c in columns}


@router.get("/tables/{table_name}")
def get_table(
    table_name: str,
    page: int = 1,
    page_size: int = 50,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    if table_name not in TABLES:
        raise HTTPException(404, "テーブルが見つかりません")

    page = max(page, 1)
    page_size = max(min(page_size, 200), 1)
    offset = (page - 1) * page_size

    if table_name == "pools":
        stmt = select(models.Pool)
        if search:
            stmt = stmt.where(models.Pool.display_name.ilike(f"%{search}%"))
        total = len(db.scalars(stmt).all())
        rows = db.scalars(stmt.order_by(models.Pool.sort_order).offset(offset).limit(page_size)).all()
        data = [_row_to_dict(r, ["key", "display_name", "sort_order"]) for r in rows]

    elif table_name == "items":
        stmt = select(models.Item)
        if search:
            stmt = stmt.where(models.Item.name.ilike(f"%{search}%"))
        total = len(db.scalars(stmt).all())
        rows = db.scalars(stmt.order_by(models.Item.id).offset(offset).limit(page_size)).all()
        data = []
        for r in rows:
            d = _row_to_dict(
                r,
                [
                    "id",
                    "type",
                    "name",
                    "positive",
                    "negative",
                    "lora_name",
                    "lora_model_strength",
                    "lora_clip_strength",
                    "image_path",
                    "memo",
                ],
            )
            d["pool"] = _pool_name(db, r.pool)
            data.append(d)

    elif table_name == "item_variants":
        stmt = select(models.ItemVariant)
        total = len(db.scalars(stmt).all())
        rows = db.scalars(stmt.order_by(models.ItemVariant.id).offset(offset).limit(page_size)).all()
        data = []
        for r in rows:
            d = _row_to_dict(r, ["id", "variant_text", "sort_order"])
            d["item"] = _item_name(db, r.item_id)
            data.append(d)

    elif table_name == "groups":
        stmt = select(models.Group)
        if search:
            stmt = stmt.where(models.Group.name.ilike(f"%{search}%"))
        total = len(db.scalars(stmt).all())
        rows = db.scalars(stmt.order_by(models.Group.id).offset(offset).limit(page_size)).all()
        data = []
        for r in rows:
            d = _row_to_dict(r, ["id", "name"])
            d["pool"] = _pool_name(db, r.pool)
            d["parent_group"] = _group_name(db, r.parent_group_id)
            data.append(d)

    elif table_name == "item_group_links":
        stmt = select(models.ItemGroupLink)
        total = len(db.scalars(stmt).all())
        rows = db.scalars(stmt.offset(offset).limit(page_size)).all()
        data = [
            {"item": _item_name(db, r.item_id), "group": _group_name(db, r.group_id)} for r in rows
        ]

    elif table_name == "item_links":
        stmt = select(models.ItemLink)
        total = len(db.scalars(stmt).all())
        rows = db.scalars(stmt.offset(offset).limit(page_size)).all()
        data = [
            {"item_a": _item_name(db, r.item_id_a), "item_b": _item_name(db, r.item_id_b)}
            for r in rows
        ]

    elif table_name == "finished_from_parts":
        stmt = select(models.FinishedFromPart)
        total = len(db.scalars(stmt).all())
        rows = db.scalars(stmt.offset(offset).limit(page_size)).all()
        data = [
            {
                "finished_item": _item_name(db, r.finished_item_id),
                "part_item": _item_name(db, r.part_item_id),
            }
            for r in rows
        ]

    elif table_name == "aliases":
        stmt = select(models.Alias)
        total = len(db.scalars(stmt).all())
        rows = db.scalars(stmt.order_by(models.Alias.id).offset(offset).limit(page_size)).all()
        data = []
        for r in rows:
            d = _row_to_dict(r, ["id", "alias_text", "lang"])
            d["item"] = _item_name(db, r.item_id)
            data.append(d)

    elif table_name == "pool_config":
        stmt = select(models.PoolConfig)
        total = len(db.scalars(stmt).all())
        rows = db.scalars(stmt.order_by(models.PoolConfig.id).offset(offset).limit(page_size)).all()
        data = []
        for r in rows:
            d = _row_to_dict(r, ["id", "key", "value"])
            d["pool"] = _pool_name(db, r.pool)
            data.append(d)

    else:
        raise HTTPException(404, "テーブルが見つかりません")

    return {
        "rows": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(math.ceil(total / page_size), 1),
    }
