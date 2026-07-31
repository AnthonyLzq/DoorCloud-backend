#!/usr/bin/env python3
"""
BFW Demographic Bias Analysis — Publication-Quality Figures & Tables
===================================================================
Generates all figures and LaTeX tables for the thesis chapter on
demographic bias in face recognition models.

Output:
  metrics/figures/     — PNG figures (300 DPI)
  metrics/tables/      — LaTeX tables

Usage:
  .venv/bin/python3 scripts/plot-bias-analysis.py
"""

import json
import os
import warnings
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from matplotlib.colors import LinearSegmentedColormap
import seaborn as sns
import pandas as pd

warnings.filterwarnings("ignore")
sns.set_theme(style="whitegrid", font_scale=1.1, font="DejaVu Sans")

# ── Config ───────────────────────────────────────────────────────────
EMB_DIR = Path("metrics/embeddings")
FIGS_DIR = Path("metrics/figures")
TABS_DIR = Path("metrics/tables")
DPI = 300
FIGS_DIR.mkdir(parents=True, exist_ok=True)
TABS_DIR.mkdir(parents=True, exist_ok=True)

GROUPS = [
    "asian_females", "asian_males",
    "black_females", "black_males",
    "indian_females", "indian_males",
    "white_females", "white_males",
]
GROUP_LABELS = [g.replace("_", " ").title() for g in GROUPS]

MODELS = [
    "dlib",
    "insightface-buffalo-s",
    "insightface-buffalo-l",
    "insightface-buffalo-m",
    "vladmandic-human",
]
MODEL_LABELS = {
    "dlib": "dlib (128D)",
    "insightface-buffalo-s": "Buffalo-S (512D)",
    "insightface-buffalo-l": "Buffalo-L (512D)",
    "insightface-buffalo-m": "Buffalo-M (512D)",
    "vladmandic-human": "Human (1024D)",
}

MODEL_COLORS = {
    "dlib": "#e41a1c",
    "insightface-buffalo-s": "#377eb8",
    "insightface-buffalo-l": "#4daf4a",
    "insightface-buffalo-m": "#984ea3",
    "vladmandic-human": "#ff7f00",
}

# ── Analysis Functions ──────────────────────────────────────────────

def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1D vectors."""
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    return float(np.dot(a, b) / denom) if denom > 0 else 0.0


def load_embeddings(model: str) -> dict:
    """Load embedding JSON and parse into per-group arrays."""
    path = EMB_DIR / f"{model}.json"
    print(f"  Loading {model}...")
    with open(path) as f:
        raw = json.load(f)

    by_group: dict[str, list[np.ndarray]] = {g: [] for g in GROUPS}
    for key, emb in raw.items():
        for g in GROUPS:
            if key.startswith(g):
                by_group[g].append(np.array(emb, dtype=np.float64))
                break
    return {g: np.array(v) for g, v in by_group.items() if v}


def analyze_model(model: str, by_group: dict) -> dict:
    """Compute all bias metrics for one model."""
    dim = next(iter(by_group.values())).shape[1]
    total = sum(v.shape[0] for v in by_group.values())

    result = {
        "model": model,
        "dim": dim,
        "total": total,
        "groups": {},
        "inter_sim": np.zeros((len(GROUPS), len(GROUPS))),
    }

    # Per-group stats
    centroids = {}
    for g in GROUPS:
        embs = by_group.get(g)
        if embs is None or len(embs) == 0:
            result["groups"][g] = {"count": 0, "intra_mean": 0, "intra_std": 0,
                                    "magnitude_mean": 0, "variance_mean": 0}
            centroids[g] = np.zeros(dim)
            continue

        centroid = np.mean(embs, axis=0)
        centroids[g] = centroid
        magnitudes = np.linalg.norm(embs, axis=1)
        intra_sims = np.array([cosine_sim(embs[i], centroid)
                               for i in range(len(embs))])

        result["groups"][g] = {
            "count": len(embs),
            "intra_mean": float(np.mean(intra_sims)),
            "intra_std": float(np.std(intra_sims, ddof=1)),
            "magnitude_mean": float(np.mean(magnitudes)),
            "variance_mean": float(np.mean(np.var(embs, axis=0, ddof=1))),
        }

    # Inter-group similarity matrix
    for i, gi in enumerate(GROUPS):
        for j, gj in enumerate(GROUPS):
            result["inter_sim"][i, j] = cosine_sim(centroids[gi], centroids[gj])

    # NN analysis (sampled)
    nn_acc = {}
    rng = np.random.default_rng(42)
    for gi, g in enumerate(GROUPS):
        embs = by_group.get(g)
        if embs is None or len(embs) < 50:
            continue
        n_sample = min(200, len(embs))
        idxs = rng.choice(len(embs), n_sample, replace=False)
        correct = 0
        for idx in idxs:
            query = embs[idx]
            best_sim = -np.inf
            best_g = ""
            for gj, other_g in enumerate(GROUPS):
                other = by_group.get(other_g)
                if other is None or len(other) == 0:
                    continue
                offset = 1 if other_g == g else 0
                for j in range(offset, len(other)):
                    if other_g == g and j == idx:
                        continue
                    sim = cosine_sim(query, other[j])
                    if sim > best_sim:
                        best_sim = sim
                        best_g = other_g
            if best_g == g:
                correct += 1
        nn_acc[g] = correct / n_sample

    result["nn_accuracy"] = nn_acc
    return result


# ── Figure 1: Intra-group Similarity ───────────────────────────────

def plot_intra_similarity(all_results: list[dict]):
    print("[fig1] Intra-group similarity...")
    n_models = len(all_results)
    n_groups = len(GROUPS)

    fig, ax = plt.subplots(figsize=(12, 6))
    x = np.arange(n_groups)
    width = 0.15

    for mi, r in enumerate(all_results):
        means = [r["groups"][g]["intra_mean"] * 100 for g in GROUPS]
        stds = [r["groups"][g]["intra_std"] * 100 for g in GROUPS]
        offset = (mi - n_models / 2 + 0.5) * width
        ax.bar(x + offset, means, width * 0.9, yerr=stds,
               label=MODEL_LABELS[r["model"]],
               color=MODEL_COLORS[r["model"]],
               capsize=2, alpha=0.85, edgecolor="white", linewidth=0.5)

    ax.set_xticks(x)
    ax.set_xticklabels(GROUP_LABELS, rotation=30, ha="right", fontsize=9)
    ax.set_ylabel("Mean Intra-group Cosine Similarity (%)", fontsize=11)
    ax.set_title("Intra-group Embedding Cohesion by Model and Demographic Group",
                 fontsize=13, fontweight="bold")
    ax.legend(fontsize=8, loc="lower left", ncol=2)
    ax.set_ylim(0, 105)
    ax.yaxis.set_major_formatter(mticker.FormatStrFormatter("%.0f%%"))
    sns.despine()

    fig.tight_layout()
    fig.savefig(FIGS_DIR / "figure04-intra-similarity.png", dpi=DPI)
    plt.close(fig)
    print(f"  -> {FIGS_DIR / 'figure04-intra-similarity.png'}")


# ── Figure 2: Inter-group Similarity Heatmaps ──────────────────────

def plot_inter_heatmaps(all_results: list[dict]):
    print("[fig2] Inter-group similarity heatmaps...")
    n_models = len(all_results)
    n_cols = 3
    n_rows = int(np.ceil(n_models / n_cols))

    fig, axes = plt.subplots(n_rows, n_cols, figsize=(16, 4.5 * n_rows))
    axes = axes.flatten()

    vmin, vmax = 20, 100

    for i, r in enumerate(all_results):
        ax = axes[i]
        mat = r["inter_sim"] * 100

        sns.heatmap(mat, annot=True, fmt=".1f", cmap="YlOrRd",
                    xticklabels=GROUP_LABELS, yticklabels=GROUP_LABELS,
                    vmin=vmin, vmax=vmax, ax=ax, cbar=True,
                    linewidths=0.5, linecolor="white",
                    annot_kws={"fontsize": 7})
        ax.set_title(MODEL_LABELS[r["model"]], fontsize=11, fontweight="bold")
        ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha="right",
                           fontsize=7)
        ax.set_yticklabels(ax.get_yticklabels(), rotation=0, fontsize=7)

    # Hide unused axes
    for j in range(i + 1, len(axes)):
        axes[j].set_visible(False)

    fig.suptitle("Inter-group Centroid Similarity (%)",
                 fontsize=14, fontweight="bold", y=1.02)
    fig.tight_layout()
    fig.savefig(FIGS_DIR / "figure05-inter-heatmaps.png", dpi=DPI,
                bbox_inches="tight")
    plt.close(fig)
    print(f"  -> {FIGS_DIR / 'figure05-inter-heatmaps.png'}")


# ── Figure 3: PCA of Group Centroids ───────────────────────────────

def plot_pca_centroids(all_results: list[dict]):
    print("[fig3] PCA of group centroids...")

    def compute_pca(centroids: dict) -> tuple:
        labels = list(centroids.keys())
        if not labels:
            return {}, [], []
        data = np.array([centroids[g] for g in labels])
        data -= data.mean(axis=0)
        k = len(labels)
        if k < 2:
            return {}, [], []

        # Gram matrix for small k
        G = (data @ data.T) / k
        eigvals, eigvecs = np.linalg.eigh(G)
        # Sort descending
        order = np.argsort(eigvals)[::-1]
        eigvals = eigvals[order]
        eigvecs = eigvecs[:, order]

        # Map back to original space
        # PC = X^T * v (normalized)
        pcs = {}
        for comp in range(min(2, k)):
            v = eigvecs[:, comp]
            pc = data.T @ v
            pc /= np.linalg.norm(pc)
            pcs[f"PC{comp+1}"] = pc

        total_var = np.trace(G)
        explained = [eigvals[i] / max(total_var, 1e-10) * 100
                     for i in range(min(2, k))]
        return labels, pcs, explained

    n_models = len(all_results)
    n_cols = 3
    n_rows = int(np.ceil(n_models / n_cols))

    fig, axes = plt.subplots(n_rows, n_cols, figsize=(16, 4.5 * n_rows))
    axes = axes.flatten()
    symbols = ["o", "s", "D", "^", "v", "P", "*", "X"]

    for i, r in enumerate(all_results):
        ax = axes[i]
        # Load the data again for PCA (centroids from stats aren't enough)
        by_group = load_embeddings(r["model"])
        centroids_arr = {}
        for g in GROUPS:
            if g in by_group and len(by_group[g]) > 0:
                centroids_arr[g] = np.mean(by_group[g], axis=0)

        labels, pcs, explained = compute_pca(centroids_arr)

        if not labels:
            ax.text(0.5, 0.5, "PCA not available", ha="center", va="center")
            ax.set_title(MODEL_LABELS[r["model"]], fontsize=11)
            continue

        # Project centroids onto PCs
        projections = {}
        for g in labels:
            c = centroids_arr[g]
            p1 = np.dot(c, pcs.get("PC1", np.zeros(c.shape[0])))
            p2 = np.dot(c, pcs.get("PC2", np.zeros(c.shape[0])))
            projections[g] = (p1, p2)

        for j, g in enumerate(labels):
            p1, p2 = projections[g]
            ax.scatter(p1, p2, marker=symbols[j % len(symbols)],
                       s=150, c=[MODEL_COLORS[r["model"]]],
                       edgecolors="black", linewidths=0.5, zorder=5,
                       label=g.replace("_", " ").title())
            ax.annotate(g.replace("_", " ").title(),
                        (p1, p2), textcoords="offset points",
                        xytext=(6, 6), fontsize=7)

        expl_text = f"PC1={explained[0]:.1f}%, PC2={explained[1]:.1f}%" if len(
            explained) >= 2 else ""
        ax.set_title(f"{MODEL_LABELS[r['model']]}\n{expl_text}",
                     fontsize=10, fontweight="bold")
        ax.set_xlabel("PC1")
        ax.set_ylabel("PC2")
        ax.axhline(0, color="grey", linewidth=0.5, linestyle="--")
        ax.axvline(0, color="grey", linewidth=0.5, linestyle="--")
        ax.legend(fontsize=6, loc="best", ncol=1)

    for j in range(i + 1, len(axes)):
        axes[j].set_visible(False)

    fig.suptitle("PCA of Demographic Group Centroids",
                 fontsize=14, fontweight="bold", y=1.02)
    fig.tight_layout()
    fig.savefig(FIGS_DIR / "figure06-pca-centroids.png", dpi=DPI,
                bbox_inches="tight")
    plt.close(fig)
    print(f"  -> {FIGS_DIR / 'figure06-pca-centroids.png'}")


# ── Figure 4: NN Accuracy by Group ─────────────────────────────────

def plot_nn_accuracy(all_results: list[dict]):
    print("[fig4] NN accuracy by group...")
    n_models = len(all_results)
    n_groups = len(GROUPS)

    fig, ax = plt.subplots(figsize=(12, 6))
    x = np.arange(n_groups)
    width = 0.15

    for mi, r in enumerate(all_results):
        accs = [r["nn_accuracy"].get(g, 0) * 100 for g in GROUPS]
        offset = (mi - n_models / 2 + 0.5) * width
        ax.bar(x + offset, accs, width * 0.9,
               label=MODEL_LABELS[r["model"]],
               color=MODEL_COLORS[r["model"]],
               alpha=0.85, edgecolor="white", linewidth=0.5)

    ax.set_xticks(x)
    ax.set_xticklabels(GROUP_LABELS, rotation=30, ha="right", fontsize=9)
    ax.set_ylabel("Nearest-Neighbor Accuracy (%)", fontsize=11)
    ax.set_title("Demographic Classification Accuracy via Nearest Neighbor",
                 fontsize=13, fontweight="bold")
    ax.set_ylim(85, 101)
    ax.legend(fontsize=8, loc="lower left", ncol=2)
    ax.yaxis.set_major_formatter(mticker.FormatStrFormatter("%.0f%%"))
    ax.axhline(100, color="grey", linewidth=0.5, linestyle="--")
    sns.despine()

    fig.tight_layout()
    fig.savefig(FIGS_DIR / "figure07-nn-accuracy.png", dpi=DPI)
    plt.close(fig)
    print(f"  -> {FIGS_DIR / 'figure07-nn-accuracy.png'}")


# ── Figure 5: Cross-Model Bias Comparison ──────────────────────────

def plot_bias_comparison(all_results: list[dict]):
    print("[fig5] Cross-model bias comparison...")

    models = [MODEL_LABELS[r["model"]] for r in all_results]
    ranges = []
    worst_groups = []
    best_groups = []
    for r in all_results:
        sims = [r["groups"][g]["intra_mean"] * 100 for g in GROUPS]
        ranges.append(max(sims) - min(sims))
        worst_groups.append(GROUPS[np.argmin(sims)].replace("_", " ").title())
        best_groups.append(GROUPS[np.argmax(sims)].replace("_", " ").title())

    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.barh(models, ranges,
                   color=[MODEL_COLORS[r["model"]] for r in all_results],
                   alpha=0.85, edgecolor="white", linewidth=0.5, height=0.6)

    for bar, r, w, b in zip(bars, ranges, worst_groups, best_groups):
        ax.text(bar.get_width() + 0.2, bar.get_y() + bar.get_height() / 2,
                f"Δ={r:.2f}%\nBest: {b}\nWorst: {w}",
                va="center", fontsize=8, color="dimgrey")

    ax.set_xlabel("Intra-group Similarity Range (Δ %)", fontsize=11)
    ax.set_title("Demographic Bias Comparison — Intra-group Similarity Range",
                 fontsize=13, fontweight="bold")
    sns.despine()
    fig.tight_layout()
    fig.savefig(FIGS_DIR / "figure08-bias-comparison.png", dpi=DPI)
    plt.close(fig)
    print(f"  -> {FIGS_DIR / 'figure08-bias-comparison.png'}")


# ── Figure 6: Inter-group Distance Matrix (one unified heatmap) ─────

def plot_inter_distance_matrix(all_results: list[dict]):
    """Compute 'demographic distance' = 1 - inter_sim for all models."""
    print("[fig6] Inter-group distance matrix...")

    n_models = len(all_results)
    fig, axes = plt.subplots(1, n_models, figsize=(5 * n_models, 4.5))

    if n_models == 1:
        axes = [axes]

    for i, r in enumerate(all_results):
        ax = axes[i]
        # Distance = 1 - similarity (make it a proper distance metric)
        dist = 1 - r["inter_sim"]
        np.fill_diagonal(dist, 0)

        sns.heatmap(dist * 100, annot=True, fmt=".1f", cmap="viridis_r",
                    xticklabels=GROUP_LABELS, yticklabels=GROUP_LABELS,
                    vmin=0, vmax=100, ax=ax, cbar=True,
                    linewidths=0.5, linecolor="white",
                    annot_kws={"fontsize": 7})
        ax.set_title(MODEL_LABELS[r["model"]], fontsize=10, fontweight="bold")
        ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha="right",
                           fontsize=6)
        ax.set_yticklabels(ax.get_yticklabels(), rotation=0, fontsize=6)

    fig.suptitle("Demographic Distance Between Group Centroids (1 − similarity)",
                 fontsize=13, fontweight="bold")
    fig.tight_layout()
    fig.savefig(FIGS_DIR / "figure09-inter-distance.png", dpi=DPI,
                bbox_inches="tight")
    plt.close(fig)
    print(f"  -> {FIGS_DIR / 'figure09-inter-distance.png'}")


# ── LaTeX Tables ───────────────────────────────────────────────────

def generate_tables(all_results: list[dict]):
    print("[tables] Generating LaTeX tables...")

    # Table 1: Per-model intra-group similarity
    lines = [
        r"\begin{table}[htbp]",
        r"\centering",
        r"\caption{Intra-group Mean Cosine Similarity (\%) Across Demographic Groups and Models}",
        r"\label{tab:intra-similarity}",
        r"\small",
        r"\begin{tabular}{l" + "c" * len(all_results) + "}",
        r"\toprule",
        r"Group & " + " & ".join(MODEL_LABELS[r["model"]] for r in all_results) + r" \\",
        r"\midrule",
    ]
    for g in GROUPS:
        row = g.replace("_", " ").title()
        for r in all_results:
            v = r["groups"][g]["intra_mean"] * 100
            s = r["groups"][g]["intra_std"] * 100
            row += f" & ${v:.2f}\\pm{s:.2f}$"
        row += r" \\"
        lines.append(row)

    # Add range row
    lines.append(r"\midrule")
    range_row = "Range ($\\Delta$)"
    for r in all_results:
        sims = [r["groups"][g]["intra_mean"] * 100 for g in GROUPS]
        range_row += f" & ${max(sims) - min(sims):.2f}$"
    range_row += r" \\"
    lines.append(range_row)
    lines.extend([
        r"\bottomrule",
        r"\end{tabular}",
        r"\end{table}",
    ])
    tab = "\n".join(lines) + "\n"
    (TABS_DIR / "tab01-intra-similarity.tex").write_text(tab)
    print(f"  -> {TABS_DIR / 'tab01-intra-similarity.tex'}")

    # Table 2: Inter-group similarity (one per model as full matrix)
    for r in all_results:
        m_short = r["model"].replace("insightface-", "if-")
        lines = [
            r"\begin{table}[htbp]",
            r"\centering",
            r"\caption{Inter-group Centroid Similarity (\%) — " + MODEL_LABELS[r["model"]] + "}",
            r"\label{tab:inter-" + m_short + "}",
            r"\tiny",
            r"\begin{tabular}{l" + "c" * len(GROUPS) + "}",
            r"\toprule",
            r" & " + " & ".join(GROUP_LABELS) + r" \\",
            r"\midrule",
        ]
        for i, gi in enumerate(GROUPS):
            row = GROUP_LABELS[i]
            for j in range(len(GROUPS)):
                row += f" & {r['inter_sim'][i, j] * 100:.1f}"
            row += r" \\"
            lines.append(row)
        lines.extend([
            r"\bottomrule",
            r"\end{tabular}",
            r"\end{table}",
        ])
        tab = "\n".join(lines) + "\n"
        (TABS_DIR / f"tab02-inter-{m_short}.tex").write_text(tab)
        print(f"  -> {TABS_DIR / f'tab02-inter-{m_short}.tex'}")

    # Table 3: Summary comparison
    lines = [
        r"\begin{table}[htbp]",
        r"\centering",
        r"\caption{Cross-Model Comparison of Accuracy and Demographic Bias}",
        r"\label{tab:model-comparison}",
        r"\small",
        r"\begin{tabular}{lcccc}",
        r"\toprule",
        r"Model & Dim & NN Acc (\%) & Intra-range ($\Delta$) & Most Biased Group \\",
        r"\midrule",
    ]
    for r in sorted(all_results, key=lambda x: -x["nn_accuracy"].get(list(x["nn_accuracy"].keys())[0], 0)):
        nn_accs = list(r["nn_accuracy"].values())
        nn_mean = np.mean(nn_accs) * 100
        sims = [r["groups"][g]["intra_mean"] * 100 for g in GROUPS]
        delta = max(sims) - min(sims)
        worst = GROUPS[np.argmin(sims)].replace("_", " ").title()
        lines.append(
            f"{MODEL_LABELS[r['model']]} & {r['dim']} & ${nn_mean:.1f}$ & ${delta:.2f}$ & {worst} \\\\"
        )
    lines.extend([
        r"\bottomrule",
        r"\end{tabular}",
        r"\end{table}",
    ])
    tab = "\n".join(lines) + "\n"
    (TABS_DIR / "tab03-model-comparison.tex").write_text(tab)
    print(f"  -> {TABS_DIR / 'tab03-model-comparison.tex'}")


# ── Main ────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("BFW Demographic Bias Analysis — Plots & Tables")
    print("=" * 60)

    all_results = []
    for model in MODELS:
        print(f"\n[{model}]")
        by_group = load_embeddings(model)
        if not by_group:
            print(f"  WARNING: No embeddings loaded for {model}, skipping")
            continue
        result = analyze_model(model, by_group)
        all_results.append(result)

        # Quick summary
        sims = [result["groups"][g]["intra_mean"] * 100 for g in GROUPS]
        print(f"  Intra-range: {min(sims):.1f}% – {max(sims):.1f}% "
              f"(Δ={max(sims) - min(sims):.2f}%)")
        nn_accs = [result["nn_accuracy"].get(g, 0) * 100 for g in GROUPS]
        print(f"  NN acc: {np.mean(nn_accs):.1f}%")

    if not all_results:
        print("ERROR: No results to plot")
        return

    print("\n" + "=" * 60)
    print("Generating figures...")
    print("=" * 60)
    plot_intra_similarity(all_results)
    plot_inter_heatmaps(all_results)
    plot_pca_centroids(all_results)
    plot_nn_accuracy(all_results)
    plot_bias_comparison(all_results)
    plot_inter_distance_matrix(all_results)

    print("\n" + "=" * 60)
    print("Generating LaTeX tables...")
    print("=" * 60)
    generate_tables(all_results)

    print("\n" + "=" * 60)
    print("Done! Output:")
    print(f"  Figures: {FIGS_DIR}/")
    print(f"  Tables:  {TABS_DIR}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
