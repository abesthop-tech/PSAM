# PSAM — ComfyUIプロンプト管理ツール

ComfyUIで使う画像生成プロンプトの作成支援・管理を行う、ローカル専用のWebアプリです。
キャラ・表情・構図などの既存プロンプト資産をGUIで組み立てて、最終的なポジティブ/ネガティブプロンプトを生成します。

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
    migrate/    JSON→SQLite 移行スクリプト
  prompt_manager.db  正データ本体(SQLite単一ファイル。git管理対象)
frontend/       React + TypeScript + Vite + Tailwind
import_data/axes/  移行元JSON資産のコピー(無改変)
docs/           技術ドキュメント・使い方マニュアル
起動.bat        ダブルクリックで両サーバーを起動
```

## スコープ外

- ComfyUIへの実際のワークフロー連携・API送信(プロンプト文字列の生成まで)
- ControlNet/IPAdapter等の機能
- 日本語⇔danbooruタグの自動紐付け(将来の拡張性として`aliases`テーブルのみ確保)
