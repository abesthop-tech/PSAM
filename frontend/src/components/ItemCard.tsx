import type { Item } from '../types'
import { IconCube, IconImage, IconPen } from './Icons'

interface Props {
  item: Item
  onClick?: (e: React.MouseEvent) => void
  selected?: boolean
  showCheckbox?: boolean
  faded?: boolean
  favorite?: boolean
  onFavorite?: (e: React.MouseEvent) => void
  onEdit?: (e: React.MouseEvent) => void
}

export default function ItemCard({ item, onClick, selected, showCheckbox, faded, favorite, onFavorite, onEdit }: Props) {
  return (
    <div
      onClick={onClick}
      className={`bg-bg-card border rounded-md overflow-hidden transition-all cursor-pointer group shadow-sm hover:shadow-md relative ${
        selected ? 'border-accent border-2' : 'border-border-dark hover:border-accent'
      } ${faded ? 'opacity-70' : ''}`}
    >
      {showCheckbox && (
        <input
          type="checkbox"
          readOnly
          checked={!!selected}
          className="absolute top-2 left-2 z-10 w-4 h-4 accent-accent cursor-pointer"
        />
      )}
      {(onFavorite || onEdit) && (
        <div className="absolute top-1 left-1 z-20 flex gap-1">
          {onFavorite && <button onClick={onFavorite} title={favorite ? 'お気に入りから外す' : 'お気に入りに追加'} className={`w-6 h-6 rounded bg-black/70 ${favorite ? 'text-yellow-400' : 'text-text-sub hover:text-yellow-400'}`}>{favorite ? '★' : '☆'}</button>}
          {onEdit && <button onClick={onEdit} title="アイテムを編集" className="w-6 h-6 rounded bg-black/70 text-text-sub hover:text-accent inline-flex items-center justify-center"><IconPen width={12} height={12} /></button>}
        </div>
      )}
      <div className="aspect-square bg-bg-base flex items-center justify-center relative overflow-hidden">
        {item.image_path ? (
          <img src={item.image_path} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <IconImage width={32} height={32} className="text-border-dark group-hover:text-[#555] transition-colors" />
        )}
        {item.lora_name && (
          <div className="absolute top-1 right-1 bg-purple-600/90 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm border border-purple-400/50 shadow flex items-center gap-0.5">
            <IconCube width={10} height={10} />
            LoRA
          </div>
        )}
      </div>
      <div className="p-2">
        <div className="text-sm font-medium text-text-main truncate" title={item.name}>
          {item.name}
        </div>
        <div className="text-[10px] text-text-sub mt-0.5 truncate" title={item.positive}>
          {item.positive || ' '}
        </div>
      </div>
    </div>
  )
}
