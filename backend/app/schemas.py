from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ---------- Pool ----------
class PoolBase(BaseModel):
    key: str
    display_name: str
    sort_order: int = 0


class PoolCreate(PoolBase):
    pass


class PoolUpdate(BaseModel):
    display_name: str | None = None
    sort_order: int | None = None


class PoolOut(PoolBase):
    model_config = ConfigDict(from_attributes=True)


# ---------- Item Variant ----------
class VariantBase(BaseModel):
    variant_text: str
    sort_order: int = 0


class VariantCreate(VariantBase):
    pass


class VariantOut(VariantBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_id: int


# ---------- Item ----------
class ItemBase(BaseModel):
    pool: str
    type: str  # 'part' | 'finished'
    name: str
    positive: str = ""
    negative: str = ""
    lora_name: str | None = None
    lora_model_strength: float | None = None
    lora_clip_strength: float | None = None
    image_path: str | None = None
    memo: str | None = None


class ItemCreate(ItemBase):
    variants: list[VariantCreate] = []
    group_ids: list[int] = []


class ItemUpdate(BaseModel):
    pool: str | None = None
    type: str | None = None
    name: str | None = None
    positive: str | None = None
    negative: str | None = None
    lora_name: str | None = None
    lora_model_strength: float | None = None
    lora_clip_strength: float | None = None
    image_path: str | None = None
    memo: str | None = None


class ItemOut(ItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    variants: list[VariantOut] = []
    created_at: datetime
    updated_at: datetime
    last_used_at: datetime | None = None


class ItemDetailOut(ItemOut):
    group_ids: list[int] = []
    linked_item_ids: list[int] = []


# ---------- Group ----------
class GroupBase(BaseModel):
    pool: str
    name: str
    parent_group_id: int | None = None


class GroupCreate(GroupBase):
    pass


class GroupUpdate(BaseModel):
    name: str | None = None


class GroupOut(GroupBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    item_count: int = 0


class GroupItemsAdd(BaseModel):
    item_ids: list[int]


# ---------- item_links ----------
class ItemLinkCreate(BaseModel):
    other_item_id: int


# ---------- compose finished from parts ----------
class ComposeFinishedRequest(BaseModel):
    pool: str
    name: str
    part_item_ids: list[int]
    separator: str = " "
    negative: str = ""
    memo: str | None = None
    image_path: str | None = None
    group_ids: list[int] = []


# ---------- pool_config ----------
class PoolConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pool: str
    key: str
    value: str


# ---------- prompt sets ----------
class PromptSetCreate(BaseModel):
    name: str
    memo: str | None = None
    positive: str = ""
    negative: str = ""
    entries: list[dict] = []


class PromptSetOut(PromptSetCreate):
    id: int
    created_at: datetime
    updated_at: datetime
