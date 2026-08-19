"""axes/ 以下の既存JSONをSQLiteへ移行するスクリプト。

設計書(4章)の方針:
- pool.json = そのプールの正データ(マスター)。character/expressionではキャラ名や単語がキー。
- pools/*.json = サブセット(グループ)定義。内容はマスターと一致しているべきで、
  食い違いがあれば統合せずログに出力する(人間が確認する)。
- 何度実行しても重複登録されないよう upsert(pool+nameで存在チェック)方式。
- インポート元JSONは書き換えない。

pool固有のデータ形状に対応するため、汎用化はせずプールごとに専用の移行関数を用意する:
- character: pool.json/pools/*.json とも "名前 -> {positive,negative,lora,memo?}" の
  アイテム定義形式(design 3.3のfinished例)。
- expression: pool.json は "カテゴリ名 -> [単語,...]" のワードバンク形式(design 3.3のpart例、
  "happy","grin"はここに由来)。pools/完成済み表情.json は "名前 -> [variant文字列,...]" という
  全く別の完成品リスト形式(design 3.4がitem_variantsの実例として明示的に言及している)。
- composition: 設計書のプール一覧には無いが、pool.jsonがexpressionと同じワードバンク形式のため
  同じロジックで part として取り込む。pools/自作構図.json も同じカテゴリ配列形式で、
  複数カテゴリ横断のサブセットグループとして扱う。BASE_POSTURE起点の条件付き有効/無効という
  木構造ロジックはDBスキーマの対象外なので保存はせず、_noteのみpool_configに残す。
"""

import json
import sys
from pathlib import Path

# allow running as `python migrate_json.py` directly
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy.orm import Session

from app import models
from app.database import Base, SessionLocal, engine

AXES_DIR = Path(__file__).resolve().parents[3] / "import_data" / "axes"
LOG_PATH = Path(__file__).resolve().parents[2] / "migration_log.txt"

log_lines: list[str] = []


def log(msg: str):
    print(msg)
    log_lines.append(msg)


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def ensure_pool(db: Session, key: str, display_name: str, sort_order: int):
    pool = db.get(models.Pool, key)
    if not pool:
        pool = models.Pool(key=key, display_name=display_name, sort_order=sort_order)
        db.add(pool)
        db.flush()
    else:
        pool.display_name = display_name
        pool.sort_order = sort_order
    return pool


def ensure_group(db: Session, pool: str, name: str) -> models.Group:
    group = db.query(models.Group).filter_by(pool=pool, name=name).first()
    if not group:
        group = models.Group(pool=pool, name=name)
        db.add(group)
        db.flush()
    return group


def link_item_group(db: Session, item: models.Item, group: models.Group):
    existing = db.get(models.ItemGroupLink, (item.id, group.id))
    if not existing:
        db.add(models.ItemGroupLink(item_id=item.id, group_id=group.id))


def save_pool_config(db: Session, pool: str, key: str, value) -> None:
    if value is None:
        return
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    existing = db.query(models.PoolConfig).filter_by(pool=pool, key=key).first()
    if existing:
        existing.value = text
    else:
        db.add(models.PoolConfig(pool=pool, key=key, value=text))


def get_item(db: Session, pool: str, name: str) -> models.Item | None:
    return db.query(models.Item).filter_by(pool=pool, name=name).first()


def upsert_character_item(db: Session, pool: str, name: str, entry: dict) -> models.Item:
    positive = entry.get("positive", "")
    negative = entry.get("negative", "") or ""
    lora_name = entry.get("lora")
    memo = entry.get("memo")

    item = get_item(db, pool, name)
    if item is None:
        item = models.Item(pool=pool, type="finished", name=name)
        db.add(item)
        db.flush()

    item.positive = positive
    item.negative = negative
    item.lora_name = lora_name
    item.lora_model_strength = 1.0 if lora_name else None
    item.lora_clip_strength = None
    item.memo = memo

    if not item.variants:
        db.add(models.ItemVariant(item_id=item.id, variant_text=positive, sort_order=0))
    else:
        item.variants[0].variant_text = positive

    db.flush()
    return item


def entry_diff(item: models.Item, entry: dict) -> list[str]:
    diffs = []
    if item.positive != entry.get("positive", ""):
        diffs.append(f"positive: master={item.positive!r} subset={entry.get('positive', '')!r}")
    if (item.negative or "") != (entry.get("negative", "") or ""):
        diffs.append(f"negative: master={item.negative!r} subset={entry.get('negative', '')!r}")
    if item.lora_name != entry.get("lora"):
        diffs.append(f"lora: master={item.lora_name!r} subset={entry.get('lora')!r}")
    return diffs


def migrate_character(db: Session):
    pool_key = "character"
    pool_dir = AXES_DIR / pool_key
    ensure_pool(db, pool_key, "02_キャラクター", 2)

    master = load_json(pool_dir / "pool.json")
    note = master.pop("_note", None)
    if note:
        save_pool_config(db, pool_key, "pool.json:_note", note)

    known_names: set[str] = set()
    for name, entry in master.items():
        upsert_character_item(db, pool_key, name, entry)
        known_names.add(name)
    log(f"[character] pool.json からアイテム {len(known_names)} 件を登録")

    for f in sorted((pool_dir / "pools").glob("*.json")):
        group_name = f.stem
        group = ensure_group(db, pool_key, group_name)
        data = load_json(f)
        data.pop("_note", None)
        linked = 0
        for name, entry in data.items():
            if name in known_names:
                item = get_item(db, pool_key, name)
                diffs = entry_diff(item, entry)
                if diffs:
                    log(f"[CONFLICT][character] {f.name} の「{name}」がマスターと不一致: " + "; ".join(diffs))
            else:
                log(f"[WARN][character] {f.name} の「{name}」はマスターpool.jsonに存在しません。このファイルの内容で新規登録します")
                upsert_character_item(db, pool_key, name, entry)
                known_names.add(name)
                item = get_item(db, pool_key, name)
            link_item_group(db, item, group)
            linked += 1
        log(f"[character] グループ「{group_name}」に {linked} 件を紐付け")


def upsert_part_item(db: Session, pool: str, name: str) -> models.Item:
    item = get_item(db, pool, name)
    if item is None:
        item = models.Item(pool=pool, type="part", name=name, positive=name, negative="")
        db.add(item)
        db.flush()
        db.add(models.ItemVariant(item_id=item.id, variant_text=name, sort_order=0))
        db.flush()
    else:
        item.positive = name
    return item


def migrate_wordbank_master(db: Session, pool_key: str, display_name: str, sort_order: int) -> int:
    """expression/composition の pool.json (カテゴリ -> [単語,...]) をpartとして取り込む。"""
    pool_dir = AXES_DIR / pool_key
    ensure_pool(db, pool_key, display_name, sort_order)

    master = load_json(pool_dir / "pool.json")
    note = master.pop("_note", None)
    config = master.pop("_config", None)
    if note:
        save_pool_config(db, pool_key, "pool.json:_note", note)
    if config:
        save_pool_config(db, pool_key, "pool.json:_config", config)

    total = 0
    for category, words in master.items():
        if category.startswith("_"):
            continue
        group = ensure_group(db, pool_key, category)
        for word in words:
            if word == "":
                continue
            item = upsert_part_item(db, pool_key, word)
            link_item_group(db, item, group)
            total += 1
    log(f"[{pool_key}] pool.json からカテゴリ {sum(1 for c in master if not c.startswith('_'))} 件・part {total} 件(重複含む)を登録")
    return total


def migrate_labeled_wordbank(db: Session, pool_key: str, display_name: str, sort_order: int) -> int:
    """カテゴリ -> {日本語ラベル: Danbooruタグ文字列} 形式のpool.jsonをpartとして取り込む。

    migrate_wordbank_masterと違い、name(ラベル)とpositive(タグ)が別物のプール用
    (演出構図・服装・背景など、今後同形式で追加するpool全般で使う汎用関数)。
    pool.jsonがまだ無いプールでもensure_poolだけは呼び、プールの登録/リネームは行う。
    """
    pool_dir = AXES_DIR / pool_key
    ensure_pool(db, pool_key, display_name, sort_order)

    pool_json = pool_dir / "pool.json"
    if not pool_json.exists():
        return 0

    master = load_json(pool_json)
    note = master.pop("_note", None)
    if note:
        save_pool_config(db, pool_key, "pool.json:_note", note)

    total = 0
    for category, entries in master.items():
        if category.startswith("_"):
            continue
        group = ensure_group(db, pool_key, category)
        for label, tag_text in entries.items():
            item = get_item(db, pool_key, label)
            if item is None:
                item = models.Item(pool=pool_key, type="part", name=label, positive=tag_text, negative="")
                db.add(item)
                db.flush()
                db.add(models.ItemVariant(item_id=item.id, variant_text=tag_text, sort_order=0))
            else:
                item.positive = tag_text
                if item.variants:
                    item.variants[0].variant_text = tag_text
            db.flush()
            link_item_group(db, item, group)
            total += 1
    log(f"[{pool_key}] pool.json からカテゴリ {sum(1 for c in master if not c.startswith('_'))} 件・part {total} 件(重複含む)を登録")
    return total


def migrate_composition_subset(db: Session):
    """composition/pools/自作構図.json: 同じカテゴリ配列形式の複数カテゴリ横断サブセット。"""
    pool_key = "composition"
    pool_dir = AXES_DIR / pool_key
    for f in sorted((pool_dir / "pools").glob("*.json")):
        group_name = f.stem
        group = ensure_group(db, pool_key, group_name)
        data = load_json(f)
        data.pop("_note", None)
        linked = 0
        for category, words in data.items():
            if category.startswith("_"):
                continue
            for word in words:
                if word == "":
                    continue
                item = get_item(db, pool_key, word)
                if item is None:
                    log(f"[WARN][composition] {f.name} のカテゴリ「{category}」の単語「{word}」はマスターpool.jsonに存在しません。スキップします")
                    continue
                link_item_group(db, item, group)
                linked += 1
        log(f"[composition] グループ「{group_name}」に {linked} 件を紐付け")


def migrate_expression_finished(db: Session):
    """expression/pools/完成済み表情.json: 名前 -> [variant文字列,...] の完成品リスト。"""
    pool_key = "expression"
    f = AXES_DIR / pool_key / "pools" / "完成済み表情.json"
    if not f.exists():
        return
    group = ensure_group(db, pool_key, f.stem)
    data = load_json(f)
    config = data.pop("_config", None)
    note = data.pop("_note", None)
    if config:
        save_pool_config(db, pool_key, f"{f.stem}:_config", config)
    if note:
        save_pool_config(db, pool_key, f"{f.stem}:_note", note)

    count = 0
    for name, variants in data.items():
        item = get_item(db, pool_key, name)
        if item is None:
            item = models.Item(pool=pool_key, type="finished", name=name, positive=variants[0] if variants else "", negative="")
            db.add(item)
            db.flush()
        else:
            item.positive = variants[0] if variants else item.positive

        existing_variants = {v.variant_text: v for v in item.variants}
        for i, text in enumerate(variants):
            if text not in existing_variants:
                db.add(models.ItemVariant(item_id=item.id, variant_text=text, sort_order=i))
        db.flush()

        link_item_group(db, item, group)
        count += 1
    log(f"[expression] 完成済み表情.json からアイテム {count} 件を登録・グループ紐付け")


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if not AXES_DIR.exists():
            log(f"axesディレクトリが見つかりません: {AXES_DIR}")
            return
        migrate_character(db)
        migrate_wordbank_master(db, "expression", "04_表情", 4)
        migrate_expression_finished(db)
        migrate_wordbank_master(db, "composition", "Composition (構図)", 3)
        migrate_composition_subset(db)

        migrate_labeled_wordbank(db, "headcount", "01_人数", 1)
        migrate_labeled_wordbank(db, "outfit", "03_服装", 3)
        migrate_labeled_wordbank(db, "restraint", "05_拘束方法", 5)
        migrate_labeled_wordbank(db, "staging", "06_演出構図", 6)
        migrate_labeled_wordbank(db, "background", "07_背景", 7)
        migrate_labeled_wordbank(db, "accessory", "08_小物", 8)
        migrate_labeled_wordbank(db, "bodytype", "体型", 103)

        db.commit()
        log("移行完了")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
        LOG_PATH.write_text("\n".join(log_lines), encoding="utf-8")
        print(f"\nログを {LOG_PATH} に保存しました")


if __name__ == "__main__":
    main()
