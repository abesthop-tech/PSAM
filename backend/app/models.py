from sqlalchemy import (
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Pool(Base):
    """Not in the original design doc's table list — added so pools can be
    created/renamed from the UI instead of being hardcoded (design doc 3.2
    calls for pools to stay flexible)."""

    __tablename__ = "pools"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (UniqueConstraint("pool", "name", name="uq_items_pool_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pool: Mapped[str] = mapped_column(String, ForeignKey("pools.key"), nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)  # 'part' | 'finished'
    name: Mapped[str] = mapped_column(String, nullable=False)
    positive: Mapped[str] = mapped_column(Text, default="")
    negative: Mapped[str] = mapped_column(Text, default="")
    lora_name: Mapped[str | None] = mapped_column(String, nullable=True)
    lora_model_strength: Mapped[float | None] = mapped_column(nullable=True)
    lora_clip_strength: Mapped[float | None] = mapped_column(nullable=True)
    image_path: Mapped[str | None] = mapped_column(String, nullable=True)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)

    variants: Mapped[list["ItemVariant"]] = relationship(
        back_populates="item", cascade="all, delete-orphan", order_by="ItemVariant.sort_order"
    )


class ItemVariant(Base):
    __tablename__ = "item_variants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    variant_text: Mapped[str] = mapped_column(Text, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    item: Mapped["Item"] = relationship(back_populates="variants")


class Group(Base):
    __tablename__ = "groups"
    __table_args__ = (UniqueConstraint("pool", "name", name="uq_groups_pool_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pool: Mapped[str] = mapped_column(String, ForeignKey("pools.key"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    parent_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("groups.id"), nullable=True
    )  # reserved for future subgroups; always NULL for now


class ItemGroupLink(Base):
    __tablename__ = "item_group_links"

    item_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), primary_key=True
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True
    )


class ItemLink(Base):
    __tablename__ = "item_links"

    item_id_a: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), primary_key=True
    )
    item_id_b: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), primary_key=True
    )


class FinishedFromPart(Base):
    __tablename__ = "finished_from_parts"

    finished_item_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), primary_key=True
    )
    part_item_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"), primary_key=True
    )


class Alias(Base):
    __tablename__ = "aliases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="CASCADE"), nullable=False)
    alias_text: Mapped[str] = mapped_column(String, nullable=False)
    lang: Mapped[str | None] = mapped_column(String, nullable=True)


class PoolConfig(Base):
    __tablename__ = "pool_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pool: Mapped[str] = mapped_column(String, ForeignKey("pools.key"), nullable=False)
    key: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[str] = mapped_column(Text, default="")
