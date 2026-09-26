"""ComfyUI integration endpoints.

The browser only communicates with PSAM.  This keeps the ComfyUI URL local to
the desktop application and gives us one place to validate/generate workflows.
"""

from __future__ import annotations

import json
import mimetypes
import re
import secrets
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/comfy", tags=["comfy"])

SETTINGS_PATH = Path(__file__).resolve().parent.parent.parent / "local_settings.json"
DEFAULT_URL = "http://127.0.0.1:8188"
LORA_TAG_RE = re.compile(r"<lora:[^>]+>", re.IGNORECASE)
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "items"
# Intentionally process-local: restarting PSAM clears this list, while the
# original files remain in ComfyUI's output directory.
SESSION_JOBS: dict[str, dict[str, Any]] = {}


class LoraInput(BaseModel):
    enabled: bool = False
    path: str | None = None
    model_strength: float = 1.0
    clip_strength: float = 1.0


class HiresInput(BaseModel):
    enabled: bool = True
    method: str = "lanczos"
    scale: float = Field(default=1.5, ge=1.0, le=4.0)
    steps: int = Field(default=10, ge=1, le=150)
    cfg: float = Field(default=7.0, ge=0, le=30)
    sampler: str = "euler"
    scheduler: str = "simple"
    denoise: float = Field(default=0.3, ge=0, le=1)


class ComfySubmit(BaseModel):
    positive: str = ""
    negative: str = ""
    checkpoint: str
    style_lora: LoraInput = LoraInput()
    character_lora: LoraInput = LoraInput()
    width: int = Field(default=832, ge=64, le=4096)
    height: int = Field(default=1216, ge=64, le=4096)
    batch_size: int = Field(default=1, ge=1, le=16)
    seed: int | None = Field(default=None, ge=0, le=2**64 - 1)
    steps: int = Field(default=25, ge=1, le=150)
    cfg: float = Field(default=7.0, ge=0, le=30)
    sampler: str = "euler"
    scheduler: str = "normal"
    denoise: float = Field(default=1.0, ge=0, le=1)
    hires: HiresInput = HiresInput()
    filename_prefix: str = "PSAM/SDXL"
    source_item_ids: list[int] = []


class ImageRef(BaseModel):
    filename: str
    subfolder: str = ""
    type: str = "output"


class PreviewRegistration(BaseModel):
    image: ImageRef
    item_ids: list[int] = []


def _settings() -> dict[str, Any]:
    if not SETTINGS_PATH.exists():
        return {"comfy_url": DEFAULT_URL}
    try:
        data = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {"comfy_url": DEFAULT_URL}
    except (OSError, json.JSONDecodeError):
        return {"comfy_url": DEFAULT_URL}


def _save_last_used(payload: ComfySubmit) -> None:
    data = _settings()
    data["last_used"] = payload.model_dump()
    try:
        SETTINGS_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise HTTPException(500, "ComfyUI設定を保存できませんでした") from exc


def _url() -> str:
    return str(_settings().get("comfy_url") or DEFAULT_URL).rstrip("/")


def _get(path: str) -> Any:
    try:
        with urlopen(f"{_url()}{path}", timeout=3) as response:  # nosec B310 -- configured local endpoint
            return json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise HTTPException(503, "ComfyUI未起動または接続できません") from exc


def _post(path: str, payload: dict[str, Any]) -> Any:
    body = json.dumps(payload).encode("utf-8")
    request = Request(f"{_url()}{path}", data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=10) as response:  # nosec B310 -- configured local endpoint
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(422, f"ComfyUIがワークフローを受け付けませんでした: {detail[:500]}") from exc
    except (URLError, TimeoutError, OSError) as exc:
        raise HTTPException(503, "ComfyUI未起動または接続できません") from exc


def _image_refs(prompt_id: str) -> tuple[str, list[dict[str, str]]]:
    if prompt_id not in SESSION_JOBS:
        raise HTTPException(404, "今回のPSAM起動中に送信したジョブではありません")
    history = _get(f"/history/{prompt_id}")
    record = history.get(prompt_id)
    if not record:
        return "running", []
    status = record.get("status", {})
    status_text = str(status.get("status_str", "")).lower()
    if status_text == "error":
        return "error", []
    images: list[dict[str, str]] = []
    for output in record.get("outputs", {}).values():
        for image in output.get("images", []):
            filename = image.get("filename")
            if filename:
                images.append({"filename": filename, "subfolder": image.get("subfolder", ""), "type": image.get("type", "output")})
    return ("complete" if status.get("completed") or images else "running"), images


def _read_image(image: ImageRef) -> tuple[bytes, str]:
    if image.type not in {"output", "temp", "input"} or not image.filename or Path(image.filename).name != image.filename:
        raise HTTPException(400, "不正な画像指定です")
    query = urlencode({"filename": image.filename, "subfolder": image.subfolder, "type": image.type})
    try:
        with urlopen(f"{_url()}/view?{query}", timeout=10) as response:  # nosec B310 -- configured local endpoint
            return response.read(), response.headers.get_content_type()
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise HTTPException(502, "ComfyUIの画像を取得できませんでした") from exc


def _lora_node(node_id: str, source_model: list[Any], source_clip: list[Any], lora: LoraInput) -> tuple[dict[str, Any] | None, list[Any], list[Any]]:
    if not lora.enabled or not lora.path:
        return None, source_model, source_clip
    # PSAM may store only a filename while ComfyUI requires the exact relative
    # path beneath its configured LoRA directories. Resolve it from ComfyUI's
    # own model list just before constructing the workflow.
    try:
        info = _get("/object_info/LoraLoader")
        available = info["LoraLoader"]["input"]["required"]["lora_name"][0]
        requested = Path(lora.path.replace("\\", "/")).stem.lower()
        matches = [name for name in available if Path(str(name).replace("\\", "/")).stem.lower() == requested]
        if len(matches) == 1:
            lora = lora.model_copy(update={"path": matches[0]})
    except (KeyError, TypeError):
        pass
    node = {
        "class_type": "LoraLoader",
        "inputs": {
            "lora_name": lora.path,
            "strength_model": lora.model_strength,
            "strength_clip": lora.clip_strength,
            "model": source_model,
            "clip": source_clip,
        },
    }
    return node, [node_id, 0], [node_id, 1]


def _workflow(payload: ComfySubmit) -> dict[str, Any]:
    seed = payload.seed if payload.seed is not None else secrets.randbelow(2**63)
    prompt = LORA_TAG_RE.sub("", payload.positive)
    prompt = re.sub(r"(?:,\s*){2,}", ", ", prompt).strip(" ,\n")

    graph: dict[str, Any] = {
        "15": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": payload.checkpoint}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": payload.width, "height": payload.height, "batch_size": payload.batch_size}},
    }
    model: list[Any] = ["15", 0]
    clip: list[Any] = ["15", 1]
    style_node, model, clip = _lora_node("16", model, clip, payload.style_lora)
    if style_node:
        graph["16"] = style_node
    character_node, model, clip = _lora_node("33", model, clip, payload.character_lora)
    if character_node:
        graph["33"] = character_node
    graph.update({
        "23": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": clip}},
        "19": {"class_type": "CLIPTextEncode", "inputs": {"text": payload.negative, "clip": clip}},
        "3": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": payload.steps, "cfg": payload.cfg, "sampler_name": payload.sampler, "scheduler": payload.scheduler, "denoise": payload.denoise, "model": model, "positive": ["23", 0], "negative": ["19", 0], "latent_image": ["4", 0]}},
        "2": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["15", 2]}},
    })
    if payload.hires.enabled:
        graph.update({
            "26": {"class_type": "ImageScaleBy", "inputs": {"upscale_method": payload.hires.method, "scale_by": payload.hires.scale, "image": ["2", 0]}},
            "27": {"class_type": "VAEEncode", "inputs": {"pixels": ["26", 0], "vae": ["15", 2]}},
            "28": {"class_type": "KSampler", "inputs": {"seed": seed, "steps": payload.hires.steps, "cfg": payload.hires.cfg, "sampler_name": payload.hires.sampler, "scheduler": payload.hires.scheduler, "denoise": payload.hires.denoise, "model": model, "positive": ["23", 0], "negative": ["19", 0], "latent_image": ["27", 0]}},
            "29": {"class_type": "VAEDecode", "inputs": {"samples": ["28", 0], "vae": ["15", 2]}},
            "22": {"class_type": "SaveImage", "inputs": {"filename_prefix": payload.filename_prefix, "images": ["29", 0]}},
        })
    else:
        graph["22"] = {"class_type": "SaveImage", "inputs": {"filename_prefix": payload.filename_prefix, "images": ["2", 0]}}
    return graph


@router.get("/status")
def status():
    _get("/system_stats")
    return {"connected": True, "url": _url()}


@router.get("/models")
def comfy_models():
    checkpoint_info = _get("/object_info/CheckpointLoaderSimple")
    lora_info = _get("/object_info/LoraLoader")
    checkpoints = checkpoint_info["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
    loras = lora_info["LoraLoader"]["input"]["required"]["lora_name"][0]
    return {"checkpoints": checkpoints, "loras": loras}


@router.post("/sync-style-items")
def sync_style_items(db: Session = Depends(get_db)):
    """Create the PSAM 00_style category from ComfyUI's style LoRA folder.

    Existing records are intentionally left alone: this is an initial import,
    not a destructive re-sync of names or prompts a user may have edited.
    """
    pool = db.get(models.Pool, "style")
    if pool is None:
        first_order = db.query(models.Pool.sort_order).order_by(models.Pool.sort_order).first()
        pool = models.Pool(key="style", display_name="00_style", sort_order=(first_order[0] - 1 if first_order else 0))
        db.add(pool)
        db.flush()
    lora_info = _get("/object_info/LoraLoader")
    loras = lora_info["LoraLoader"]["input"]["required"]["lora_name"][0]
    style_loras = [name for name in loras if re.match(r"^style[\\/]", str(name), re.IGNORECASE)]
    existing = {
        item.lora_name
        for item in db.query(models.Item).filter(models.Item.pool == "style").all()
        if item.lora_name
    }
    created = 0
    for lora_name in style_loras:
        if lora_name in existing:
            continue
        filename = str(lora_name).replace("\\", "/").rsplit("/", 1)[-1]
        trigger = "zzstyle" if filename.lower() == "dashio.safetensors" else re.sub(r"\.safetensors$", "", filename, flags=re.IGNORECASE)
        db.add(models.Item(
            pool="style", type="part", name=trigger, positive=trigger, negative="",
            lora_name=lora_name, lora_model_strength=1.0, lora_clip_strength=None,
        ))
        created += 1
    db.commit()
    return {"pool": "style", "created": created, "total": len(style_loras)}


@router.get("/settings")
def settings():
    data = _settings()
    return {"defaults": data.get("defaults", {}), "last_used": data.get("last_used", {})}


@router.post("/submit")
def submit(payload: ComfySubmit):
    result = _post("/prompt", {"prompt": _workflow(payload), "client_id": "psam"})
    _save_last_used(payload)
    prompt_id = result.get("prompt_id")
    if not prompt_id:
        raise HTTPException(502, "ComfyUIからジョブIDを取得できませんでした")
    SESSION_JOBS[prompt_id] = {"source_item_ids": payload.source_item_ids, "created_at": time.time()}
    return {"prompt_id": prompt_id, "number": result.get("number")}


@router.get("/jobs")
def list_jobs():
    return [{"prompt_id": prompt_id, **job} for prompt_id, job in reversed(list(SESSION_JOBS.items()))]


@router.get("/jobs/{prompt_id}")
def job_status(prompt_id: str):
    state, images = _image_refs(prompt_id)
    return {"prompt_id": prompt_id, "state": state, "images": images, **SESSION_JOBS[prompt_id]}


@router.get("/jobs/{prompt_id}/image")
def job_image(prompt_id: str, filename: str, subfolder: str = "", type: str = "output"):
    _, refs = _image_refs(prompt_id)
    image = ImageRef(filename=filename, subfolder=subfolder, type=type)
    if image.model_dump() not in refs:
        raise HTTPException(404, "このジョブの画像ではありません")
    content, content_type = _read_image(image)
    return Response(content=content, media_type=content_type)


@router.post("/jobs/{prompt_id}/register-preview")
def register_preview(prompt_id: str, payload: PreviewRegistration, db: Session = Depends(get_db)):
    _, refs = _image_refs(prompt_id)
    if payload.image.model_dump() not in refs:
        raise HTTPException(404, "このジョブの画像ではありません")
    allowed_ids = set(SESSION_JOBS[prompt_id]["source_item_ids"])
    target_ids = list(dict.fromkeys(item_id for item_id in payload.item_ids if item_id in allowed_ids))
    if not target_ids:
        raise HTTPException(400, "Buildから渡されたアイテムを1つ以上選択してください")
    targets = [db.get(models.Item, item_id) for item_id in target_ids]
    targets = [item for item in targets if item is not None and not item.image_path]
    if not targets:
        raise HTTPException(409, "選択したアイテムにはすでにプレビューがあります")
    content, content_type = _read_image(payload.image)
    suffix = mimetypes.guess_extension(content_type) or ".png"
    if suffix == ".jpe":
        suffix = ".jpg"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    registered_ids: list[int] = []
    for item in targets:
        filename = f"{item.id}_{int(time.time() * 1000)}{suffix}"
        (UPLOAD_DIR / filename).write_bytes(content)
        item.image_path = f"/uploads/items/{filename}"
        registered_ids.append(item.id)
    db.commit()
    return {"registered_item_ids": registered_ids, "skipped_item_ids": sorted(set(target_ids) - set(registered_ids))}
