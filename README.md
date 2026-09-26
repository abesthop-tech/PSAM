# PSAM — ComfyUIプロンプト管理ツール

ComfyUIで使う画像生成プロンプトの作成支援・管理と、ComfyUIへの生成送信を行うローカル専用Webアプリです。
キャラ・表情・構図などの既存プロンプト資産をGUIで組み立て、生成条件を指定して画像生成まで実行できます。

- 使い方: [docs/使い方マニュアル.md](docs/使い方マニュアル.md)
- 実装内容の詳細(設計からの逸脱点・API仕様など): [docs/実装ドキュメント.md](docs/実装ドキュメント.md)

## 技術スタック

- バックエンド: Python (FastAPI + SQLAlchemy) / SQLite
- フロントエンド: React + TypeScript (Vite) + Tailwind CSS

## セットアップ(初回のみ)

```bash
# バックエンド
cd backend
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt

# フロントエンド
cd ../frontend
npm install
```

> Python 3.14 環境では `pydantic-core` にビルド済みwheelがあるバージョンを使う必要があります。
> `requirements.txt` に記載のバージョンをそのままインストールすれば問題ありません
> (バージョンを下げるとRustソースからのビルドが発生し、MSVCビルドツールが無い環境では失敗します)。

初回のみ、既存の `axes` JSON資産をデータベースへ取り込みます。

```bash
cd backend
venv\Scripts\python.exe -m app.migrate.migrate_json
```

upsert方式のため、`import_data/axes` 配下のJSONを直接編集して再実行しても、既存データを壊さずに変更点だけ反映されます。実行結果(不一致チェックの結果など)は `backend/migration_log.txt` に出力されます(git管理外)。

## 起動

`起動.bat` をダブルクリックすると、バックエンド・フロントエンドが両方立ち上がり、自動でブラウザ (`http://localhost:5173`) が開きます。

手動で起動する場合:

```bash
# ターミナル1
cd backend
venv\Scripts\python.exe -m uvicorn app.main:app --port 8000

# ターミナル2
cd frontend
npm run dev
```

## ディレクトリ構成

```
backend/        FastAPI + SQLAlchemy + SQLite
  app/
    routers/comfy.py  ComfyUI接続・ワークフロー生成・画像取得
    migrate/    JSON→SQLite 移行スクリプト
  prompt_manager.db  正データ本体(SQLite単一ファイル。git管理対象)
frontend/       React + TypeScript + Vite + Tailwind
import_data/axes/  移行元JSON資産のコピー(無改変)
docs/           技術ドキュメント・使い方マニュアル
起動.bat        ダブルクリックで両サーバーを起動
```

## ComfyUI連携

- 左サイドバーの接続ランプで、起動時点のComfyUI接続状態を確認できます。
- 「作成」画面のPositiveを「ComfyUI」画面へ置換または追記で引き渡せます。
- Checkpoint、Sampler、Scheduler、Seed、Steps、CFG、Hires fixなどを指定して送信できます。
- 絵柄・キャラクターLoRAを自動判定し、置換候補ごとのModel/CLIP強度も指定できます。
- ComfyUIの接続先と前回設定は `backend/local_settings.json` に保存されます。このファイルは端末固有のためgit管理外です。

## 現在の制約

- ControlNet/IPAdapter等の機能
- PSAM再起動前に送信したジョブ履歴の復元
- 同時に適用するLoRAは絵柄用とキャラクター用の各1枠
- 日本語⇔danbooruタグの自動紐付け(将来の拡張性として`aliases`テーブルのみ確保)
