#!/usr/bin/env python3
"""Run a side-channel PP-OCRv6 benchmark against recent Screenpipe frames.

This does not write back to Screenpipe. It treats Screenpipe's current OCR text
as a baseline, then runs PP-OCRv6 tiers on the same screenshots.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sqlite3
import statistics
import time
import traceback
import urllib.request
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any


DEFAULT_DB = Path.home() / ".screenpipe" / "db.sqlite"
DEFAULT_BASE_URL = "http://localhost:3111"
DEFAULT_TIERS = ("tiny", "small", "medium")


@dataclass
class FrameSample:
    id: int
    timestamp: str
    app_name: str | None
    window_name: str | None
    browser_url: str | None
    text_source: str | None
    baseline_text: str


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", "", value).lower()


def ngrams(value: str, n: int = 3) -> set[str]:
    norm = normalize_text(value)
    if len(norm) <= n:
        return {norm} if norm else set()
    return {norm[i : i + n] for i in range(0, len(norm) - n + 1)}


def similarity(candidate: str, baseline: str) -> dict[str, float]:
    c = normalize_text(candidate)
    b = normalize_text(baseline)
    c3 = ngrams(candidate)
    b3 = ngrams(baseline)
    inter = len(c3 & b3)
    union = len(c3 | b3)
    return {
        "sequence_ratio": round(SequenceMatcher(None, c, b).ratio(), 4) if c and b else 0.0,
        "char_len_ratio": round((len(c) / len(b)), 4) if b else 0.0,
        "trigram_jaccard": round((inter / union), 4) if union else 0.0,
        "trigram_recall_vs_screenpipe": round((inter / len(b3)), 4) if b3 else 0.0,
    }


def pick_samples(db_path: Path, limit: int) -> list[FrameSample]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            """
            WITH recent AS (
              SELECT
                id,
                timestamp,
                app_name,
                window_name,
                browser_url,
                text_source,
                full_text,
                ROW_NUMBER() OVER (
                  PARTITION BY COALESCE(app_name, ''), COALESCE(window_name, '')
                  ORDER BY id DESC
                ) AS app_window_rank
              FROM frames
              WHERE full_text IS NOT NULL
                AND LENGTH(full_text) BETWEEN 120 AND 12000
              ORDER BY id DESC
              LIMIT 250
            )
            SELECT * FROM recent
            ORDER BY app_window_rank ASC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    finally:
        conn.close()

    return [
        FrameSample(
            id=int(row["id"]),
            timestamp=str(row["timestamp"]),
            app_name=row["app_name"],
            window_name=row["window_name"],
            browser_url=row["browser_url"],
            text_source=row["text_source"],
            baseline_text=row["full_text"] or "",
        )
        for row in rows
    ]


def fetch_frame(base_url: str, frame_id: int, image_dir: Path) -> Path:
    image_dir.mkdir(parents=True, exist_ok=True)
    path = image_dir / f"{frame_id}.jpg"
    if not path.exists() or path.stat().st_size == 0:
        urllib.request.urlretrieve(f"{base_url.rstrip('/')}/screenpipe/frames/{frame_id}", path)
    return path


def create_contact_sheet(samples: list[FrameSample], image_paths: dict[int, Path], out_path: Path) -> None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:
        return

    thumbs: list[tuple[FrameSample, Image.Image]] = []
    for sample in samples:
        image_path = image_paths.get(sample.id)
        if not image_path:
            continue
        try:
            img = Image.open(image_path).convert("RGB")
            img.thumbnail((480, 270))
            canvas = Image.new("RGB", (480, 300), "white")
            canvas.paste(img, (0, 0))
            draw = ImageDraw.Draw(canvas)
            try:
                font = ImageFont.truetype("Arial Unicode.ttf", 14)
            except Exception:
                font = ImageFont.load_default()
            label = f"{sample.id}  {sample.app_name or '-'}"
            draw.rectangle((0, 270, 480, 300), fill=(245, 245, 245))
            draw.text((8, 278), label[:80], fill=(20, 20, 20), font=font)
            thumbs.append((sample, canvas))
        except Exception:
            continue
    if not thumbs:
        return
    cols = 2
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 480, rows * 300), "white")
    for index, (_, img) in enumerate(thumbs):
        x = (index % cols) * 480
        y = (index // cols) * 300
        sheet.paste(img, (x, y))
    sheet.save(out_path, quality=88)


def run_tier(tier: str, image_paths: list[Path], min_score: float) -> dict[str, Any]:
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    from paddleocr import PaddleOCR

    model_names = {
        "tiny": ("PP-OCRv6_tiny_det", "PP-OCRv6_tiny_rec"),
        "small": ("PP-OCRv6_small_det", "PP-OCRv6_small_rec"),
        "medium": ("PP-OCRv6_medium_det", "PP-OCRv6_medium_rec"),
    }
    if tier not in model_names:
        raise ValueError(f"Unsupported PP-OCRv6 tier: {tier}")
    det_name, rec_name = model_names[tier]

    t0 = time.perf_counter()
    ocr = PaddleOCR(
        text_detection_model_name=det_name,
        text_recognition_model_name=rec_name,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    init_ms = round((time.perf_counter() - t0) * 1000)

    predictions: list[dict[str, Any]] = []
    for image_path in image_paths:
        p0 = time.perf_counter()
        result = ocr.predict(str(image_path))
        predict_ms = round((time.perf_counter() - p0) * 1000)
        texts: list[str] = []
        raw_count = 0
        kept_scores: list[float] = []
        for page in result:
            rec_texts = list(page.get("rec_texts", []))
            rec_scores = list(page.get("rec_scores", []))
            raw_count += len(rec_texts)
            for text, score in zip(rec_texts, rec_scores):
                if not isinstance(text, str) or not text.strip():
                    continue
                score_float = float(score)
                if score_float < min_score:
                    continue
                texts.append(text.strip())
                kept_scores.append(score_float)
        joined = "\n".join(texts)
        predictions.append(
            {
                "frame_id": int(image_path.stem),
                "predict_ms": predict_ms,
                "raw_item_count": raw_count,
                "kept_line_count": len(texts),
                "avg_score": round(statistics.mean(kept_scores), 4) if kept_scores else 0.0,
                "text": joined,
                "text_excerpt": joined[:1600],
            }
        )
    return {"tier": tier, "init_ms": init_ms, "predictions": predictions}


def summarize(results: dict[str, Any]) -> str:
    lines = [
        "# PP-OCRv6 Screenpipe Side-Channel Eval",
        "",
        f"- generated_at: {results['generated_at']}",
        f"- samples: {len(results['samples'])}",
        f"- min_score: {results['min_score']}",
        f"- db: `{results['db_path']}`",
        f"- baseline: Screenpipe `frames.full_text`; this is not ground truth.",
        "",
        "## Tier Summary",
        "",
        "| tier | status | init ms | avg predict ms | avg lines | avg seq ratio | avg 3g recall |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for tier, data in results["tiers"].items():
        if data.get("status") != "ok":
            err = str(data.get("error", "")).replace("\n", " ")[:90]
            lines.append(f"| {tier} | failed: {err} | - | - | - | - | - |")
            continue
        preds = data["predictions"]
        avg_ms = statistics.mean([p["predict_ms"] for p in preds]) if preds else 0
        avg_lines = statistics.mean([p["kept_line_count"] for p in preds]) if preds else 0
        avg_seq = statistics.mean([p["metrics"]["sequence_ratio"] for p in preds]) if preds else 0
        avg_recall = statistics.mean([p["metrics"]["trigram_recall_vs_screenpipe"] for p in preds]) if preds else 0
        lines.append(
            f"| {tier} | ok | {data['init_ms']} | {avg_ms:.0f} | {avg_lines:.1f} | {avg_seq:.3f} | {avg_recall:.3f} |"
        )

    lines.extend(["", "## Samples", ""])
    for sample in results["samples"]:
        lines.append(
            f"### frame {sample['id']} - {sample.get('app_name') or '-'} - {sample.get('window_name') or '-'}"
        )
        lines.append(f"- time: {sample['timestamp']}")
        lines.append(f"- baseline chars: {sample['baseline_chars']}")
        if sample.get("browser_url"):
            lines.append(f"- url: {sample['browser_url']}")
        for tier, data in results["tiers"].items():
            if data.get("status") != "ok":
                continue
            pred = next((p for p in data["predictions"] if p["frame_id"] == sample["id"]), None)
            if not pred:
                continue
            m = pred["metrics"]
            lines.append(
                f"- {tier}: {pred['predict_ms']}ms, lines={pred['kept_line_count']}, "
                f"seq={m['sequence_ratio']}, 3g_recall={m['trigram_recall_vs_screenpipe']}, chars_ratio={m['char_len_ratio']}"
            )
        lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--tiers", default=",".join(DEFAULT_TIERS))
    parser.add_argument("--min-score", type=float, default=0.5)
    parser.add_argument("--out-dir", default="outputs/ocr")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = Path(args.db).expanduser()
    out_root = Path(args.out_dir)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = out_root / f"ppocrv6_eval_{stamp}"
    image_dir = out_dir / "frames"
    out_dir.mkdir(parents=True, exist_ok=True)

    samples = pick_samples(db_path, args.limit)
    if not samples:
        raise RuntimeError(f"No suitable Screenpipe frames found in {db_path}")

    image_paths_by_id: dict[int, Path] = {}
    for sample in samples:
        image_paths_by_id[sample.id] = fetch_frame(args.base_url, sample.id, image_dir)

    create_contact_sheet(samples, image_paths_by_id, out_dir / "contact_sheet.jpg")

    results: dict[str, Any] = {
        "generated_at": dt.datetime.now(dt.UTC).isoformat(),
        "db_path": str(db_path),
        "base_url": args.base_url,
        "min_score": args.min_score,
        "samples": [
            {
                "id": s.id,
                "timestamp": s.timestamp,
                "app_name": s.app_name,
                "window_name": s.window_name,
                "browser_url": s.browser_url,
                "text_source": s.text_source,
                "baseline_chars": len(normalize_text(s.baseline_text)),
                "baseline_excerpt": s.baseline_text[:1600],
            }
            for s in samples
        ],
        "tiers": {},
    }

    tiers = [tier.strip() for tier in args.tiers.split(",") if tier.strip()]
    ordered_image_paths = [image_paths_by_id[s.id] for s in samples]
    baseline_by_id = {s.id: s.baseline_text for s in samples}
    for tier in tiers:
        try:
            tier_result = run_tier(tier, ordered_image_paths, args.min_score)
            for pred in tier_result["predictions"]:
                pred["metrics"] = similarity(pred["text"], baseline_by_id[pred["frame_id"]])
            results["tiers"][tier] = {"status": "ok", **tier_result}
        except Exception as exc:
            results["tiers"][tier] = {
                "status": "failed",
                "error": str(exc),
                "traceback": traceback.format_exc(),
            }

        json_path = out_dir / "results.json"
        json_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        (out_dir / "report.md").write_text(summarize(results), encoding="utf-8")

    print(json.dumps({"ok": True, "out_dir": str(out_dir), "samples": [s.id for s in samples]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
