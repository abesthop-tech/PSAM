import type { DbTablePage, Group, Item, ItemDetail, ItemType, Pool, PromptSet, PromptSetEntry, Variant } from '../types'

const BASE = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

// ---------- pools ----------
export const api = {
  listPools: () => request<Pool[]>('/pools'),
  createPool: (data: { key: string; display_name: string; sort_order?: number }) =>
    request<Pool>('/pools', { method: 'POST', body: JSON.stringify(data) }),
  updatePool: (key: string, data: Partial<Pick<Pool, 'display_name' | 'sort_order'>>) =>
    request<Pool>(`/pools/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePool: (key: string) => request(`/pools/${encodeURIComponent(key)}`, { method: 'DELETE' }),

  // ---------- items ----------
  listItems: (params: {
    pool?: string
    type?: ItemType
    group_id?: number
    ungrouped?: boolean
    search?: string
    sort?: 'name' | 'created' | 'updated' | 'used'
    order?: 'asc' | 'desc'
  }) => request<Item[]>(`/items${qs({ ...params, ungrouped: params.ungrouped ? 'true' : undefined })}`),
  getItem: (id: number) => request<ItemDetail>(`/items/${id}`),
  createItem: (data: {
    pool: string
    type: ItemType
    name: string
    positive?: string
    negative?: string
    lora_name?: string | null
    lora_model_strength?: number | null
    lora_clip_strength?: number | null
    image_path?: string | null
    memo?: string | null
    group_ids?: number[]
    variants?: { variant_text: string; sort_order?: number }[]
  }) => request<ItemDetail>('/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: number, data: Partial<Item>) =>
    request<ItemDetail>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteItem: (id: number) => request(`/items/${id}`, { method: 'DELETE' }),
  touchItem: (id: number) => request<ItemDetail>(`/items/${id}/touch`, { method: 'POST' }),
  listFavoriteIds: () => request<number[]>('/favorites'),
  addFavorite: (id: number) => request(`/favorites/${id}`, { method: 'PUT' }),
  removeFavorite: (id: number) => request(`/favorites/${id}`, { method: 'DELETE' }),
  uploadItemImage: async (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}/items/${id}/image`, { method: 'POST', body: form })
    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body.detail ?? detail
      } catch {
        // ignore
      }
      throw new Error(detail)
    }
    return res.json() as Promise<ItemDetail>
  },

  addVariant: (itemId: number, variant_text: string, sort_order = 0) =>
    request<Variant>(`/items/${itemId}/variants`, { method: 'POST', body: JSON.stringify({ variant_text, sort_order }) }),
  updateVariant: (itemId: number, variantId: number, variant_text: string, sort_order = 0) =>
    request<Variant>(`/items/${itemId}/variants/${variantId}`, { method: 'PUT', body: JSON.stringify({ variant_text, sort_order }) }),
  deleteVariant: (itemId: number, variantId: number) =>
    request(`/items/${itemId}/variants/${variantId}`, { method: 'DELETE' }),

  addItemToGroup: (itemId: number, groupId: number) =>
    request(`/items/${itemId}/groups/${groupId}`, { method: 'POST' }),
  removeItemFromGroup: (itemId: number, groupId: number) =>
    request(`/items/${itemId}/groups/${groupId}`, { method: 'DELETE' }),

  addLink: (itemId: number, otherItemId: number) =>
    request(`/items/${itemId}/links`, { method: 'POST', body: JSON.stringify({ other_item_id: otherItemId }) }),
  removeLink: (itemId: number, otherItemId: number) =>
    request(`/items/${itemId}/links/${otherItemId}`, { method: 'DELETE' }),

  composeFinished: (data: { pool: string; name: string; part_item_ids: number[]; separator?: string; negative?: string; memo?: string; group_ids?: number[] }) =>
    request<ItemDetail>('/items/compose-finished', { method: 'POST', body: JSON.stringify(data) }),
  getSourceParts: (itemId: number) => request<Item[]>(`/items/${itemId}/source-parts`),

  // ---------- prompt sets ----------
  listPromptSets: () => request<PromptSet[]>('/prompt-sets'),
  savePromptSet: (data: { name: string; memo?: string; positive: string; negative: string; entries: PromptSetEntry[] }) =>
    request<PromptSet>('/prompt-sets', { method: 'POST', body: JSON.stringify(data) }),
  deletePromptSet: (id: number) => request(`/prompt-sets/${id}`, { method: 'DELETE' }),

  // ---------- groups ----------
  listGroups: (params: { pool?: string; search?: string }) => request<Group[]>(`/groups${qs(params)}`),
  createGroup: (data: { pool: string; name: string }) =>
    request<Group>('/groups', { method: 'POST', body: JSON.stringify(data) }),
  updateGroup: (id: number, data: { name: string }) =>
    request<Group>(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteGroup: (id: number) => request(`/groups/${id}`, { method: 'DELETE' }),
  getGroupItems: (id: number) => request<Item[]>(`/groups/${id}/items`),
  addItemsToGroup: (id: number, itemIds: number[]) =>
    request(`/groups/${id}/items`, { method: 'POST', body: JSON.stringify({ item_ids: itemIds }) }),
  removeItemFromGroupBulk: (groupId: number, itemId: number) =>
    request(`/groups/${groupId}/items/${itemId}`, { method: 'DELETE' }),

  // ---------- db viewer ----------
  listTables: () => request<string[]>('/db/tables'),
  getTable: (name: string, params: { page?: number; page_size?: number; search?: string }) =>
    request<DbTablePage>(`/db/tables/${name}${qs(params)}`),

  // ---------- export ----------
  exportPoolUrl: (pool: string) => `${BASE}/export/pools/${encodeURIComponent(pool)}`,
  exportGroupUrl: (groupId: number) => `${BASE}/export/groups/${groupId}`,
}
