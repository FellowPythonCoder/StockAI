"""Empirical out-of-sample probability calibration and reliability verification."""

from __future__ import annotations

from dataclasses import dataclass
import numpy as np
from sklearn.linear_model import LogisticRegression

from ..schemas import CalibrationBin


@dataclass
class CalibratedProbabilityModel:
    is_calibrated: bool
    brier_score: float
    baseline_brier_score: float
    sample_size: int
    base_rate: float
    slope: float
    intercept: float
    bins: list[CalibrationBin]
    note: str

    def predict_prob_up(self, pred_z: float) -> float:
        raw_logit = self.intercept + self.slope * float(np.clip(pred_z, -2.5, 2.5))
        p_platt = 1.0 / (1.0 + np.exp(-raw_logit))
        # Shrink moderately toward empirical base rate to prevent overconfident tail probabilities
        shrunk = 0.75 * p_platt + 0.25 * self.base_rate
        return float(np.clip(shrunk, 0.22, 0.78))


def fit_probability_calibrator(pred_z_oos: np.ndarray, actual_returns_oos: np.ndarray) -> CalibratedProbabilityModel:
    """Fits Platt / logistic calibration on strictly out-of-sample walk-forward predictions."""
    mask = np.isfinite(pred_z_oos) & np.isfinite(actual_returns_oos)
    z = pred_z_oos[mask]
    y = (actual_returns_oos[mask] > 0.0).astype(int)
    n = int(len(y))

    if n < 40 or len(np.unique(y)) < 2:
        base = float(np.mean(y)) if n > 0 else 0.52
        return CalibratedProbabilityModel(
            is_calibrated=False,
            brier_score=0.25,
            baseline_brier_score=0.25,
            sample_size=n,
            base_rate=base,
            slope=0.35,
            intercept=float(np.log(np.clip(base, 0.1, 0.9) / (1.0 - np.clip(base, 0.1, 0.9)))),
            bins=[],
            note=f"Validation sample ({n} out-of-sample windows) is below the 40-observation calibration threshold.",
        )

    base_rate = float(np.mean(y))
    baseline_brier = float(np.mean((y - base_rate) ** 2))

    # Fit regularized logistic calibration with chronological 2-half cross-fitting to avoid in-sample Brier optimism
    mid = n // 2
    z_col = np.clip(z, -2.5, 2.5).reshape(-1, 1)

    clf_full = LogisticRegression(C=0.5, solver="lbfgs")
    clf_full.fit(z_col, y)
    slope = float(clf_full.coef_[0][0])
    intercept = float(clf_full.intercept_[0])

    # Prevent inverted probability slope if noisy sample has slight negative correlation:
    # shrink slope to 0 (climatological base rate) rather than anti-calibrating
    if slope < 0.0:
        slope = 0.0
        intercept = float(np.log(np.clip(base_rate, 0.05, 0.95) / (1.0 - np.clip(base_rate, 0.05, 0.95))))

    # Evaluate cross-fitted out-of-sample calibrated probabilities
    cal_probs = np.empty(n, dtype=float)
    if len(np.unique(y[:mid])) >= 2 and len(np.unique(y[mid:])) >= 2:
        c1 = LogisticRegression(C=0.5, solver="lbfgs").fit(z_col[:mid], y[:mid])
        s1 = max(0.0, float(c1.coef_[0][0]))
        i1 = float(c1.intercept_[0]) if s1 > 0 else intercept
        p2 = 1.0 / (1.0 + np.exp(-(i1 + s1 * z[mid:])))
        cal_probs[mid:] = 0.75 * p2 + 0.25 * float(np.mean(y[:mid]))

        c2 = LogisticRegression(C=0.5, solver="lbfgs").fit(z_col[mid:], y[mid:])
        s2 = max(0.0, float(c2.coef_[0][0]))
        i2 = float(c2.intercept_[0]) if s2 > 0 else intercept
        p1 = 1.0 / (1.0 + np.exp(-(i2 + s2 * z[:mid])))
        cal_probs[:mid] = 0.75 * p1 + 0.25 * float(np.mean(y[mid:]))
    else:
        raw_p = 1.0 / (1.0 + np.exp(-(intercept + slope * z)))
        cal_probs = 0.75 * raw_p + 0.25 * base_rate

    cal_probs = np.clip(cal_probs, 0.22, 0.78)
    brier = float(np.mean((y - cal_probs) ** 2))

    # Build quantile reliability bins for transparent inspection
    n_bins = min(5, max(3, n // 30))
    quantiles = np.linspace(0.0, 1.0, n_bins + 1)
    edges = np.quantile(cal_probs, quantiles)
    edges[0] -= 1e-6
    edges[-1] += 1e-6

    bins: list[CalibrationBin] = []
    for b_idx in range(n_bins):
        lo, hi = edges[b_idx], edges[b_idx + 1]
        if b_idx < n_bins - 1:
            in_b = (cal_probs >= lo) & (cal_probs < hi)
        else:
            in_b = (cal_probs >= lo) & (cal_probs <= hi)
        cnt = int(np.sum(in_b))
        if cnt == 0:
            continue
        p_mean = float(np.mean(cal_probs[in_b]))
        obs = float(np.mean(y[in_b]))
        bins.append(
            CalibrationBin(
                bin_label=f"{int(round(p_mean * 100))}% bin",
                predicted_mean=round(p_mean * 100.0, 1),
                observed_rate=round(obs * 100.0, 1),
                count=cnt,
            )
        )

    is_calibrated = n >= 60 and brier <= baseline_brier * 1.03
    if is_calibrated:
        note = (
            f"Calibrated across {n} chronological out-of-sample windows "
            f"(Brier score {brier:.4f} vs climatology {baseline_brier:.4f})."
        )
    else:
        note = (
            f"Limited probability discrimination across {n} out-of-sample windows "
            f"(Brier {brier:.4f}); probability shrunk toward historical base rate ({base_rate * 100:.1f}%)."
        )

    return CalibratedProbabilityModel(
        is_calibrated=is_calibrated,
        brier_score=round(brier, 4),
        baseline_brier_score=round(baseline_brier, 4),
        sample_size=n,
        base_rate=base_rate,
        slope=slope,
        intercept=intercept,
        bins=bins,
        note=note,
    )
