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
EMBEDDINGS_DIR = Path("metrics/embeddings")
FIGURES_DIR = Path("metrics/figures")
TABLES_DIR = Path("metrics/tables")
DPI = 300
FIGURES_DIR.mkdir(parents=True, exist_ok=True)
TABLES_DIR.mkdir(parents=True, exist_ok=True)

GROUPS = [
    "asian_females", "asian_males",
    "black_females", "black_males",
    "indian_females", "indian_males",
    "white_females", "white_males",
]
GROUP_LABELS = [group.replace("_", " ").title() for group in GROUPS]

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

def cosine_similarity(vector_a: np.ndarray, vector_b: np.ndarray) -> float:
    """Cosine similarity between two 1D vectors."""
    denominator = np.linalg.norm(vector_a) * np.linalg.norm(vector_b)
    return float(np.dot(vector_a, vector_b) / denominator) if denominator > 0 else 0.0


def load_embeddings(model: str) -> dict:
    """Load embedding JSON and parse into per-group arrays."""
    path = EMBEDDINGS_DIR / f"{model}.json"
    print(f"  Loading {model}...")
    with open(path) as f:
        raw_data = json.load(f)

    embeddings_by_group: dict[str, list[np.ndarray]] = {
        group: [] for group in GROUPS
    }
    for image_path, embedding in raw_data.items():
        for group in GROUPS:
            if image_path.startswith(group):
                embeddings_by_group[group].append(
                    np.array(embedding, dtype=np.float64)
                )
                break
    return {
        group: np.array(embeddings)
        for group, embeddings in embeddings_by_group.items()
        if embeddings
    }


def analyze_model(model: str, embeddings_by_group: dict) -> dict:
    """Compute all bias metrics for one model."""
    dim = next(iter(embeddings_by_group.values())).shape[1]
    total = sum(embeddings.shape[0] for embeddings in embeddings_by_group.values())

    result = {
        "model": model,
        "dim": dim,
        "total": total,
        "groups": {},
        "inter_sim": np.zeros((len(GROUPS), len(GROUPS))),
    }

    # Per-group stats
    centroids = {}
    for group in GROUPS:
        group_embeddings = embeddings_by_group.get(group)
        if group_embeddings is None or len(group_embeddings) == 0:
            result["groups"][group] = {
                "count": 0,
                "intra_mean": 0,
                "intra_std": 0,
                "magnitude_mean": 0,
                "variance_mean": 0,
            }
            centroids[group] = np.zeros(dim)
            continue

        group_centroid = np.mean(group_embeddings, axis=0)
        centroids[group] = group_centroid
        magnitudes = np.linalg.norm(group_embeddings, axis=1)
        intra_similarities = np.array(
            [
                cosine_similarity(group_embeddings[i], group_centroid)
                for i in range(len(group_embeddings))
            ]
        )

        result["groups"][group] = {
            "count": len(group_embeddings),
            "intra_mean": float(np.mean(intra_similarities)),
            "intra_std": float(np.std(intra_similarities, ddof=1)),
            "magnitude_mean": float(np.mean(magnitudes)),
            "variance_mean": float(np.mean(np.var(group_embeddings, axis=0, ddof=1))),
        }

    # Inter-group similarity matrix
    for i, group_i in enumerate(GROUPS):
        for j, group_j in enumerate(GROUPS):
            result["inter_sim"][i, j] = cosine_similarity(
                centroids[group_i], centroids[group_j]
            )

    # NN analysis (sampled)
    nn_accuracy = {}
    rng = np.random.default_rng(42)
    for group in GROUPS:
        group_embeddings = embeddings_by_group.get(group)
        if group_embeddings is None or len(group_embeddings) < 50:
            continue
        sample_count = min(200, len(group_embeddings))
        sample_indices = rng.choice(len(group_embeddings), sample_count, replace=False)
        correct = 0
        for sample_index in sample_indices:
            query_embedding = group_embeddings[sample_index]
            best_similarity = -np.inf
            best_group = ""
            for other_group in GROUPS:
                other_embeddings = embeddings_by_group.get(other_group)
                if other_embeddings is None or len(other_embeddings) == 0:
                    continue
                start_offset = 1 if other_group == group else 0
                for j in range(start_offset, len(other_embeddings)):
                    if other_group == group and j == sample_index:
                        continue
                    similarity = cosine_similarity(query_embedding, other_embeddings[j])
                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_group = other_group
            if best_group == group:
                correct += 1
        nn_accuracy[group] = correct / sample_count

    result["nn_accuracy"] = nn_accuracy
    return result


# ── Figure 1: Intra-group Similarity ───────────────────────────────

def plot_intra_similarity(all_results: list[dict]):
    print("[fig1] Intra-group similarity...")
    n_models = len(all_results)
    n_groups = len(GROUPS)

    fig, ax = plt.subplots(figsize=(12, 6))
    x = np.arange(n_groups)
    width = 0.15

    for model_index, model_result in enumerate(all_results):
        mean_similarities = [
            model_result["groups"][group]["intra_mean"] * 100 for group in GROUPS
        ]
        std_similarities = [
            model_result["groups"][group]["intra_std"] * 100 for group in GROUPS
        ]
        offset = (model_index - n_models / 2 + 0.5) * width
        ax.bar(x + offset, mean_similarities, width * 0.9, yerr=std_similarities,
               label=MODEL_LABELS[model_result["model"]],
               color=MODEL_COLORS[model_result["model"]],
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
    fig.savefig(FIGURES_DIR / "figure04-intra-similarity.png", dpi=DPI)
    plt.close(fig)
    print(f"  -> {FIGURES_DIR / 'figure04-intra-similarity.png'}")


# ── Figure 2: Inter-group Similarity Heatmaps ──────────────────────

def plot_inter_heatmaps(all_results: list[dict]):
    print("[fig2] Inter-group similarity heatmaps...")
    n_models = len(all_results)
    n_cols = 3
    n_rows = int(np.ceil(n_models / n_cols))

    fig, axes = plt.subplots(n_rows, n_cols, figsize=(16, 4.5 * n_rows))
    axes = axes.flatten()

    vmin, vmax = 20, 100

    for plot_index, model_result in enumerate(all_results):
        ax = axes[plot_index]
        similarity_matrix = model_result["inter_sim"] * 100

        sns.heatmap(similarity_matrix, annot=True, fmt=".1f", cmap="YlOrRd",
                    xticklabels=GROUP_LABELS, yticklabels=GROUP_LABELS,
                    vmin=vmin, vmax=vmax, ax=ax, cbar=True,
                    linewidths=0.5, linecolor="white",
                    annot_kws={"fontsize": 7})
        ax.set_title(MODEL_LABELS[model_result["model"]], fontsize=11, fontweight="bold")
        ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha="right",
                           fontsize=7)
        ax.set_yticklabels(ax.get_yticklabels(), rotation=0, fontsize=7)

    # Hide unused axes
    for j in range(plot_index + 1, len(axes)):
        axes[j].set_visible(False)

    fig.suptitle("Inter-group Centroid Similarity (%)",
                 fontsize=14, fontweight="bold", y=1.02)
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "figure05-inter-heatmaps.png", dpi=DPI,
                bbox_inches="tight")
    plt.close(fig)
    print(f"  -> {FIGURES_DIR / 'figure05-inter-heatmaps.png'}")


# ── Figure 3: PCA of Group Centroids ───────────────────────────────

def plot_pca_centroids(all_results: list[dict]):
    print("[fig3] PCA of group centroids...")

    def compute_pca(group_centroids: dict) -> tuple:
        group_labels = list(group_centroids.keys())
        if not group_labels:
            return {}, [], []
        centered_matrix = np.array([group_centroids[group] for group in group_labels])
        centered_matrix -= centered_matrix.mean(axis=0)
        group_count = len(group_labels)
        if group_count < 2:
            return {}, [], []

        # Gram matrix for small group_count
        gram_matrix = (centered_matrix @ centered_matrix.T) / group_count
        eigenvalues, eigenvectors = np.linalg.eigh(gram_matrix)
        # Sort descending
        order = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[order]
        eigenvectors = eigenvectors[:, order]

        # Map back to original space
        # PC = X^T * v (normalized)
        principal_components = {}
        for component_index in range(min(2, group_count)):
            eigenvector = eigenvectors[:, component_index]
            principal_component = centered_matrix.T @ eigenvector
            principal_component /= np.linalg.norm(principal_component)
            principal_components[f"PC{component_index+1}"] = principal_component

        total_variance = np.trace(gram_matrix)
        explained = [
            eigenvalues[i] / max(total_variance, 1e-10) * 100
            for i in range(min(2, group_count))
        ]
        return group_labels, principal_components, explained

    n_models = len(all_results)
    n_cols = 3
    n_rows = int(np.ceil(n_models / n_cols))

    fig, axes = plt.subplots(n_rows, n_cols, figsize=(16, 4.5 * n_rows))
    axes = axes.flatten()
    symbols = ["o", "s", "D", "^", "v", "P", "*", "X"]

    for plot_index, model_result in enumerate(all_results):
        ax = axes[plot_index]
        # Load the data again for PCA (centroids from stats aren't enough)
        embeddings_by_group = load_embeddings(model_result["model"])
        group_centroids = {}
        for group in GROUPS:
            if group in embeddings_by_group and len(embeddings_by_group[group]) > 0:
                group_centroids[group] = np.mean(embeddings_by_group[group], axis=0)

        group_labels, principal_components, explained = compute_pca(group_centroids)

        if not group_labels:
            ax.text(0.5, 0.5, "PCA not available", ha="center", va="center")
            ax.set_title(MODEL_LABELS[model_result["model"]], fontsize=11)
            continue

        # Project centroids onto PCs
        projections = {}
        for group in group_labels:
            centroid = group_centroids[group]
            projection_1 = np.dot(centroid, principal_components.get("PC1", np.zeros(centroid.shape[0])))
            projection_2 = np.dot(centroid, principal_components.get("PC2", np.zeros(centroid.shape[0])))
            projections[group] = (projection_1, projection_2)

        for j, group in enumerate(group_labels):
            projection_1, projection_2 = projections[group]
            ax.scatter(projection_1, projection_2, marker=symbols[j % len(symbols)],
                       s=150, c=[MODEL_COLORS[model_result["model"]]],
                       edgecolors="black", linewidths=0.5, zorder=5,
                       label=group.replace("_", " ").title())
            ax.annotate(group.replace("_", " ").title(),
                        (projection_1, projection_2), textcoords="offset points",
                        xytext=(6, 6), fontsize=7)

        explanation_text = (
            f"PC1={explained[0]:.1f}%, PC2={explained[1]:.1f}%"
            if len(explained) >= 2
            else ""
        )
        ax.set_title(
            f"{MODEL_LABELS[model_result['model']]}\n{explanation_text}",
            fontsize=10, fontweight="bold"
        )
        ax.set_xlabel("PC1")
        ax.set_ylabel("PC2")
        ax.axhline(0, color="grey", linewidth=0.5, linestyle="--")
        ax.axvline(0, color="grey", linewidth=0.5, linestyle="--")
        ax.legend(fontsize=6, loc="best", ncol=1)

    for j in range(plot_index + 1, len(axes)):
        axes[j].set_visible(False)

    fig.suptitle("PCA of Demographic Group Centroids",
                 fontsize=14, fontweight="bold", y=1.02)
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "figure06-pca-centroids.png", dpi=DPI,
                bbox_inches="tight")
    plt.close(fig)
    print(f"  -> {FIGURES_DIR / 'figure06-pca-centroids.png'}")


# ── Figure 4: NN Accuracy by Group ─────────────────────────────────

def plot_nn_accuracy(all_results: list[dict]):
    print("[fig4] NN accuracy by group...")
    n_models = len(all_results)
    n_groups = len(GROUPS)

    fig, ax = plt.subplots(figsize=(12, 6))
    x = np.arange(n_groups)
    width = 0.15

    for model_index, model_result in enumerate(all_results):
        accuracies = [
            model_result["nn_accuracy"].get(group, 0) * 100 for group in GROUPS
        ]
        offset = (model_index - n_models / 2 + 0.5) * width
        ax.bar(x + offset, accuracies, width * 0.9,
               label=MODEL_LABELS[model_result["model"]],
               color=MODEL_COLORS[model_result["model"]],
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
    fig.savefig(FIGURES_DIR / "figure07-nn-accuracy.png", dpi=DPI)
    plt.close(fig)
    print(f"  -> {FIGURES_DIR / 'figure07-nn-accuracy.png'}")


# ── Figure 5: Cross-Model Bias Comparison ──────────────────────────

def plot_bias_comparison(all_results: list[dict]):
    print("[fig5] Cross-model bias comparison...")

    models = [MODEL_LABELS[model_result["model"]] for model_result in all_results]
    intra_ranges = []
    worst_groups = []
    best_groups = []
    for model_result in all_results:
        similarities = [
            model_result["groups"][group]["intra_mean"] * 100 for group in GROUPS
        ]
        intra_ranges.append(max(similarities) - min(similarities))
        worst_groups.append(GROUPS[np.argmin(similarities)].replace("_", " ").title())
        best_groups.append(GROUPS[np.argmax(similarities)].replace("_", " ").title())

    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.barh(models, intra_ranges,
                   color=[MODEL_COLORS[model_result["model"]] for model_result in all_results],
                   alpha=0.85, edgecolor="white", linewidth=0.5, height=0.6)

    for bar, intra_range, worst_group, best_group in zip(
        bars, intra_ranges, worst_groups, best_groups
    ):
        ax.text(bar.get_width() + 0.2, bar.get_y() + bar.get_height() / 2,
                f"Δ={intra_range:.2f}%\nBest: {best_group}\nWorst: {worst_group}",
                va="center", fontsize=8, color="dimgrey")

    ax.set_xlabel("Intra-group Similarity Range (Δ %)", fontsize=11)
    ax.set_title("Demographic Bias Comparison — Intra-group Similarity Range",
                 fontsize=13, fontweight="bold")
    sns.despine()
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "figure08-bias-comparison.png", dpi=DPI)
    plt.close(fig)
    print(f"  -> {FIGURES_DIR / 'figure08-bias-comparison.png'}")


# ── Figure 6: Inter-group Distance Matrix (one unified heatmap) ─────

def plot_inter_distance_matrix(all_results: list[dict]):
    """Compute 'demographic distance' = 1 - inter_sim for all models."""
    print("[fig6] Inter-group distance matrix...")

    n_models = len(all_results)
    fig, axes = plt.subplots(1, n_models, figsize=(5 * n_models, 4.5))

    if n_models == 1:
        axes = [axes]

    for plot_index, model_result in enumerate(all_results):
        ax = axes[plot_index]
        # Distance = 1 - similarity (make it a proper distance metric)
        distance_matrix = 1 - model_result["inter_sim"]
        np.fill_diagonal(distance_matrix, 0)

        sns.heatmap(distance_matrix * 100, annot=True, fmt=".1f", cmap="viridis_r",
                    xticklabels=GROUP_LABELS, yticklabels=GROUP_LABELS,
                    vmin=0, vmax=100, ax=ax, cbar=True,
                    linewidths=0.5, linecolor="white",
                    annot_kws={"fontsize": 7})
        ax.set_title(MODEL_LABELS[model_result["model"]], fontsize=10, fontweight="bold")
        ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha="right",
                           fontsize=6)
        ax.set_yticklabels(ax.get_yticklabels(), rotation=0, fontsize=6)

    fig.suptitle("Demographic Distance Between Group Centroids (1 − similarity)",
                 fontsize=13, fontweight="bold")
    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "figure09-inter-distance.png", dpi=DPI,
                bbox_inches="tight")
    plt.close(fig)
    print(f"  -> {FIGURES_DIR / 'figure09-inter-distance.png'}")


# ── Figure 10: Verification AUC by Group ───────────────────────────

def plot_verification_auc():
    """AUC per demographic group from analyze-demographics results."""
    print("[fig10] Verification AUC by group...")

    csv_path = Path("metrics/demographics/demographics-results.csv")
    if not csv_path.exists():
        print("  WARNING: demographics-results.csv not found, skipping figure10")
        return

    results_df = pd.read_csv(csv_path)
    group_map = {
        "A_F": "Asian\nFemale", "A_M": "Asian\nMale",
        "B_F": "Black\nFemale", "B_M": "Black\nMale",
        "I_F": "Indian\nFemale", "I_M": "Indian\nMale",
        "W_F": "White\nFemale", "W_M": "White\nMale",
    }
    results_df["group_label"] = results_df["group"].map(group_map).fillna(results_df["group"])
    results_df["model_label"] = results_df["model"].map(MODEL_LABELS).fillna(results_df["model"])

    # Order models by average AUC for readability
    avg_auc = results_df.groupby("model")["auc"].mean().sort_values(ascending=False)
    model_order = list(avg_auc.index)
    results_df["model"] = pd.Categorical(
        results_df["model"], categories=model_order, ordered=True
    )
    results_df = results_df.sort_values(["model", "group"])

    n_models = len(model_order)
    fig, ax = plt.subplots(figsize=(12, 6))
    x = np.arange(len(results_df["group_label"].unique()))
    width = 0.85 / n_models

    for i, model in enumerate(model_order):
        model_data = results_df[results_df["model"] == model]
        auc_values = model_data.set_index("group_label")["auc"].reindex(
            [value for value in results_df["group_label"].unique()]
        )
        bars = ax.bar(x + i * width, auc_values, width,
                      label=MODEL_LABELS[model], color=MODEL_COLORS[model],
                      alpha=0.85, edgecolor="white", linewidth=0.5)
        for bar, value in zip(bars, auc_values):
            if value > 0:
                ax.text(bar.get_x() + bar.get_width() / 2.,
                        bar.get_height() + 0.003, f"{value:.3f}",
                        ha="center", va="bottom", fontsize=6, rotation=45)

    ax.set_xticks(x + width * (n_models - 1) / 2)
    ax.set_xticklabels([value for value in results_df["group_label"].unique()], fontsize=9)
    ax.set_ylabel("Verification AUC", fontsize=11)
    ax.set_title("Verification AUC by Demographic Group (BFW Pair Dataset)",
                 fontsize=13, fontweight="bold")
    ax.set_ylim(0.85, 1.01)
    ax.axhline(0.5, color="grey", linewidth=0.5, linestyle="--",
               label="Random (AUC=0.5)")
    ax.legend(fontsize=8, loc="lower left", ncol=2)
    ax.grid(axis="y", linestyle=":", alpha=0.4)
    sns.despine()

    fig.tight_layout()
    fig.savefig(FIGURES_DIR / "figure10-verification-auc.png", dpi=DPI)
    plt.close(fig)
    print(f"  -> {FIGURES_DIR / 'figure10-verification-auc.png'}")


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
        r"Group & " + " & ".join(MODEL_LABELS[model_result["model"]] for model_result in all_results) + r" \\",
        r"\midrule",
    ]
    for group in GROUPS:
        row = group.replace("_", " ").title()
        for model_result in all_results:
            intra_mean = model_result["groups"][group]["intra_mean"] * 100
            intra_std = model_result["groups"][group]["intra_std"] * 100
            row += f" & ${intra_mean:.2f}\\pm{intra_std:.2f}$"
        row += r" \\"
        lines.append(row)

    # Add range row
    lines.append(r"\midrule")
    range_row = "Range ($\\Delta$)"
    for model_result in all_results:
        similarities = [
            model_result["groups"][group]["intra_mean"] * 100 for group in GROUPS
        ]
        range_row += f" & ${max(similarities) - min(similarities):.2f}$"
    range_row += r" \\"
    lines.append(range_row)
    lines.extend([
        r"\bottomrule",
        r"\end{tabular}",
        r"\end{table}",
    ])
    table = "\n".join(lines) + "\n"
    (TABLES_DIR / "tab01-intra-similarity.tex").write_text(table)
    print(f"  -> {TABLES_DIR / 'tab01-intra-similarity.tex'}")

    # Table 2: Inter-group similarity (one per model as full matrix)
    for model_result in all_results:
        model_short = model_result["model"].replace("insightface-", "if-")
        lines = [
            r"\begin{table}[htbp]",
            r"\centering",
            r"\caption{Inter-group Centroid Similarity (\%) — " + MODEL_LABELS[model_result["model"]] + "}",
            r"\label{tab:inter-" + model_short + "}",
            r"\tiny",
            r"\begin{tabular}{l" + "c" * len(GROUPS) + "}",
            r"\toprule",
            r" & " + " & ".join(GROUP_LABELS) + r" \\",
            r"\midrule",
        ]
        for i, group_i in enumerate(GROUPS):
            row = GROUP_LABELS[i]
            for j in range(len(GROUPS)):
                row += f" & {model_result['inter_sim'][i, j] * 100:.1f}"
            row += r" \\"
            lines.append(row)
        lines.extend([
            r"\bottomrule",
            r"\end{tabular}",
            r"\end{table}",
        ])
        table = "\n".join(lines) + "\n"
        (TABLES_DIR / f"tab02-inter-{model_short}.tex").write_text(table)
        print(f"  -> {TABLES_DIR / f'tab02-inter-{model_short}.tex'}")

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
    for model_result in sorted(
        all_results,
        key=lambda result: -result["nn_accuracy"].get(
            list(result["nn_accuracy"].keys())[0], 0
        ),
    ):
        nn_accuracies = list(model_result["nn_accuracy"].values())
        nn_mean = np.mean(nn_accuracies) * 100
        similarities = [
            model_result["groups"][group]["intra_mean"] * 100 for group in GROUPS
        ]
        intra_range = max(similarities) - min(similarities)
        worst_group = GROUPS[np.argmin(similarities)].replace("_", " ").title()
        lines.append(
            f"{MODEL_LABELS[model_result['model']]} & {model_result['dim']} & ${nn_mean:.1f}$ & ${intra_range:.2f}$ & {worst_group} \\\\"
        )
    lines.extend([
        r"\bottomrule",
        r"\end{tabular}",
        r"\end{table}",
    ])
    table = "\n".join(lines) + "\n"
    (TABLES_DIR / "tab03-model-comparison.tex").write_text(table)
    print(f"  -> {TABLES_DIR / 'tab03-model-comparison.tex'}")


# ── Main ────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("BFW Demographic Bias Analysis — Plots & Tables")
    print("=" * 60)

    all_results = []
    for model in MODELS:
        print(f"\n[{model}]")
        embeddings_by_group = load_embeddings(model)
        if not embeddings_by_group:
            print(f"  WARNING: No embeddings loaded for {model}, skipping")
            continue
        model_result = analyze_model(model, embeddings_by_group)
        all_results.append(model_result)

        # Quick summary
        similarities = [
            model_result["groups"][group]["intra_mean"] * 100 for group in GROUPS
        ]
        print(f"  Intra-range: {min(similarities):.1f}% – {max(similarities):.1f}% "
              f"(Δ={max(similarities) - min(similarities):.2f}%)")
        nn_accuracies = [
            model_result["nn_accuracy"].get(group, 0) * 100 for group in GROUPS
        ]
        print(f"  NN acc: {np.mean(nn_accuracies):.1f}%")

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
    plot_verification_auc()

    print("\n" + "=" * 60)
    print("Generating LaTeX tables...")
    print("=" * 60)
    generate_tables(all_results)

    print("\n" + "=" * 60)
    print("Done! Output:")
    print(f"  Figures: {FIGURES_DIR}/")
    print(f"  Tables:  {TABLES_DIR}/")
    print("=" * 60)


if __name__ == "__main__":
    main()
