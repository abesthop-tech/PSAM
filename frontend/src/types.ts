export type ItemType = 'part' | 'finished'

export interface Pool {
  key: string
  display_name: string
  sort_order: number
}

export interface Variant {
  id: number
  item_id: number
  variant_text: string
  sort_order: number
}

export interface Item {
  id: number
  pool: string
  type: ItemType
  name: string
  positive: string
  negative: string
  lora_name: string | null
  lora_model_strength: number | null
  lora_clip_strength: number | null
  image_path: string | null
  memo: string | null
  variants: Variant[]
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export interface ItemDetail extends Item {
  group_ids: number[]
  linked_item_ids: number[]
}

export interface Group {
  id: number
  pool: string
  name: string
  parent_group_id: number | null
  item_count: number
}

export interface PoolConfigRow {
  id: number
  pool: string
  key: string
  value: string
}

export interface DbTablePage {
  rows: Record<string, unknown>[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface PromptSetEntry {
  item_id: number
  variant_index: number
  lora_model: number | null
  lora_clip: number | null
}

export interface PromptSet {
  id: number
  name: string
  memo: string | null
  positive: string
  negative: string
  entries: PromptSetEntry[]
  created_at: string
  updated_at: string
}
