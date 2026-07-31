#!/usr/bin/env python3
"""
Pipeline Alignment Impact — BFW ROC Comparison
===============================================
Compares the ROC curves of Buffalo-S on the BFW pair dataset between:
  - baseline: center-crop 112x112 on pre-aligned BFW crops (benchmark embeddings)
  - aligned : production detect (det_500m) + landmark warp + w600k_mbf embed

Output:
  metrics/figures/figure11-pipeline-roc.png (300 DPI)

Usage:
  .venv/bin/python3 scripts/plot_pipeline_roc.py
"""

import os
import warnings
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd

warnings.filterwarnings("ignore")
sns.set_theme(style="whitegrid", font_scale=1.1, font="DejaVu Sans")

# ── Config ───────────────────────────────────────────────────────────
ROC_DIR = Path("metrics/roc-pipeline")
FIGURES_DIR = Path("metrics/figures")
DPI = 300
TARGET_FAR = 1e-4
FIGURES_DIR.mkdir(parents=True, exist_ok=True)

PIPELINES = {
    "baseline": ("Baseline (center-crop)", "#c44e52", "solid"),
    "aligned": ("Production (det + align)", "#4c72b0", "solid"),
}


def compute_roc(sim: np.ndarray, labels: np.ndarray):
    order = np.argsort(-sim)
    sim = sim[order]
    labels = labels[order]
    total_pos = int(labels.sum())
    total_neg = int(len(labels) - total_pos)
    tp = np.cumsum(labels)
    fp = np.cumsum(1 - labels)
    tpr = tp / total_pos
    far = fp / total_neg
    return far, tpr, sim


def threshold_at_far(sim, labels, target_far):
    far, tpr, sim = compute_roc(sim, labels)
    idx = np.searchsorted(far, target_far, side="right") - 1
    idx = max(idx, 0)
    return sim[idx], tpr[idx], far[idx]


def main():
    fig, ax = plt.subplots(figsize=(8, 6))

    for key, (label, color, style) in PIPELINES.items():
        path = ROC_DIR / f"{key}-similarities.csv"
        if not path.exists():
            print(f"WARNING: {path} not found, skipping {key}")
            continue
        data = pd.read_csv(path)
        sim = data["similarity"].to_numpy(dtype=float)
        labels = data["label"].to_numpy(dtype=int)
        far, tpr, _ = compute_roc(sim, labels)
        auc = np.trapezoid(tpr, far) if len(far) > 1 else float("nan")
        threshold, tar, _ = threshold_at_far(sim, labels, TARGET_FAR)

        ax.plot(far, tpr, color=color, linestyle=style, linewidth=2,
                label=f"{label} (AUC={auc:.4f})")

        # Mark the operating point at FAR = 1e-4
        marker_idx = np.searchsorted(far, TARGET_FAR, side="right") - 1
        marker_idx = max(marker_idx, 0)
        ax.scatter([far[marker_idx]], [tpr[marker_idx]], color=color, zorder=5,
                   s=40, edgecolor="white", linewidth=0.8)
        ax.annotate(
            f"thr={threshold:.4f}\nTAR={tar:.3f}",
            xy=(far[marker_idx], tpr[marker_idx]),
            xytext=(far[marker_idx] * 3.2, tpr[marker_idx] - 0.05),
            fontsize=9, color=color,
            arrowprops=dict(arrowstyle="->", color=color, lw=0.8),
        )

    ax.axvline(TARGET_FAR, color="gray", linestyle="--", linewidth=1,
               label=f"Target FAR = {TARGET_FAR:.0e}")
    ax.set_xscale("log")
    ax.set_xlim(1e-6, 1)
    ax.set_ylim(0, 1.02)
    ax.set_xlabel("False Acceptance Rate (FAR)")
    ax.set_ylabel("True Acceptance Rate (TAR)")
    ax.set_title("Buffalo-S Verification on BFW: Benchmark vs Production Pipeline")
    ax.legend(loc="lower right", fontsize=10)

    out = FIGURES_DIR / "figure11-pipeline-roc.png"
    fig.savefig(out, dpi=DPI, bbox_inches="tight")
    print(f"  -> {out}")
    print("  Thresholds at FAR=1e-4 and TAR values annotated on the curves.")


if __name__ == "__main__":
    main()
