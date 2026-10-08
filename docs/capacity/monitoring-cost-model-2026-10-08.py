#!/usr/bin/env python3
"""Modelo de dimensionamento, sem acesso a rede, credenciais ou produção.

Uso: python3 docs/capacity/monitoring-cost-model-2026-10-08.py
Ajuste as hipóteses com --assumptions ARQUIVO_JSON. Saída: JSON em stdout.
DAU e visitantes anônimos são parâmetros de volume, não capacidade validada.
"""
from decimal import Decimal, ROUND_CEILING
from pathlib import Path
import argparse
import json

DEFAULTS = {
    "scenarios_authenticated_dau": [60, 1000, 10000, 50000],
    "anonymous_session_ratio": 1,
    "signals_per_actor_day": 40,
    "raw_retention_days": 7,
    "raw_archive_bytes_per_signal": 200,
    "raw_local_bytes_per_signal_with_indexes": 800,
    "authenticated_identity_days": 35,
    "anonymous_identity_days": 2,
    "identity_bytes_per_actor_day": 320,
    "identity_offsite_snapshot_copies": 3,
    "new_accounts_per_authenticated_dau_assumed": 1,
    "cohort_state_retention_days": 35,
    "cohort_state_bytes_per_account_with_indexes": 192,
    "archive_metric_series": 500,
    "minute_retention_days": 30,
    "five_minute_retention_days": 90,
    "hourly_retention_total_days": 400,
    "archive_bytes_per_metric_point": 32,
    "local_bytes_per_metric_point_with_indexes": 160,
    "daily_aggregate_rows": 200,
    "daily_aggregate_bytes_per_row": 512,
    "daily_aggregate_days": 400,
    "diagnostic_log_budget_compressed_mb_day": 100,
    "diagnostic_log_days": 7,
    "capacity_receipts_archive_bytes_budget": 100000000,
    "sizing_multiplier": 2,
    "local_wal_reserved_bytes": 1073741824,
    "local_scratch_reserved_bytes": 1073741824,
    "collector_volume_gib": 20,
    "collector_operational_volume_fraction": 0.8,
    "r2_class_a_operations_budget_month": 100000,
    "r2_class_b_operations_budget_month": 100000,
    "r2_free_storage_gb_month": 10,
    "r2_free_class_a_operations_month": 1000000,
    "r2_free_class_b_operations_month": 10000000,
    "r2_storage_usd_gb_month": "0.015",
    "r2_class_a_usd_million": "4.50",
    "r2_class_b_usd_million": "0.36",
    "prometheus_new_series_target": 3000,
    "prometheus_scrape_seconds": 15,
    "prometheus_retention_days_observed": 15,
    "prometheus_bytes_per_sample_estimate": 2,
    "prometheus_index_wal_factor_assumed": 3,
}


def ceil_units(amount):
    return int(
        max(Decimal(str(amount)), Decimal(0)).to_integral_value(rounding=ROUND_CEILING)
    )


def r2_cost(total_bytes, a, b, p, free=True):
    storage_free = p["r2_free_storage_gb_month"] if free else 0
    a_free = p["r2_free_class_a_operations_month"] if free else 0
    b_free = p["r2_free_class_b_operations_month"] if free else 0
    units_gb = ceil_units(Decimal(total_bytes) / Decimal(1000000000) - storage_free)
    units_a = ceil_units((Decimal(a) - a_free) / Decimal(1000000))
    units_b = ceil_units((Decimal(b) - b_free) / Decimal(1000000))
    storage_cost = units_gb * Decimal(p["r2_storage_usd_gb_month"])
    operations_cost = units_a * Decimal(
        p["r2_class_a_usd_million"]
    ) + units_b * Decimal(p["r2_class_b_usd_million"])
    return {
        "billable_gb_units": units_gb,
        "billable_class_a_million_units": units_a,
        "billable_class_b_million_units": units_b,
        "storage_usd_month": str(storage_cost),
        "operations_usd_month": str(operations_cost),
        "total_usd_month": str(storage_cost + operations_cost),
    }


def calculate(p):
    s = p["archive_metric_series"]
    margin = p["sizing_multiplier"]
    minute_points = s * 1440 * p["minute_retention_days"]
    historical_points = s * (
        288 * p["five_minute_retention_days"]
        + 24 * (p["hourly_retention_total_days"] - p["five_minute_retention_days"])
    )
    daily_aggregate_bytes = (
        p["daily_aggregate_rows"]
        * p["daily_aggregate_bytes_per_row"]
        * p["daily_aggregate_days"]
        * margin
    )
    cloud_fixed = (
        (minute_points + historical_points)
        * p["archive_bytes_per_metric_point"]
        * margin
        + daily_aggregate_bytes
        + p["diagnostic_log_budget_compressed_mb_day"]
        * 1000000
        * p["diagnostic_log_days"]
        * margin
        + p["capacity_receipts_archive_bytes_budget"]
    )
    local_fixed = (
        minute_points * p["local_bytes_per_metric_point_with_indexes"] * margin
        + daily_aggregate_bytes
        + p["local_wal_reserved_bytes"]
        + p["local_scratch_reserved_bytes"]
    )
    result = []
    for dau in p["scenarios_authenticated_dau"]:
        anon = int(dau * p["anonymous_session_ratio"])
        actors = dau + anon
        signal_rows = actors * p["signals_per_actor_day"] * p["raw_retention_days"]
        identity_rows = (
            dau * p["authenticated_identity_days"] + anon * p["anonymous_identity_days"]
        )
        cloud_raw = signal_rows * p["raw_archive_bytes_per_signal"] * margin
        cloud_identity = (
            identity_rows
            * p["identity_bytes_per_actor_day"]
            * p["identity_offsite_snapshot_copies"]
            * margin
        )
        local_raw = signal_rows * p["raw_local_bytes_per_signal_with_indexes"] * margin
        local_identity = identity_rows * p["identity_bytes_per_actor_day"] * margin
        cohort_rows = (
            dau
            * p["new_accounts_per_authenticated_dau_assumed"]
            * p["cohort_state_retention_days"]
        )
        local_cohort = (
            cohort_rows * p["cohort_state_bytes_per_account_with_indexes"] * margin
        )
        cloud_cohort = local_cohort * p["identity_offsite_snapshot_copies"]
        cloud = int(cloud_fixed + cloud_raw + cloud_identity + cloud_cohort)
        local = int(local_fixed + local_raw + local_identity + local_cohort)
        result.append(
            {
                "authenticated_dau": dau,
                "anonymous_sessions_per_day_assumed": anon,
                "signals_day": actors * p["signals_per_actor_day"],
                "new_accounts_day_assumed": dau
                * p["new_accounts_per_authenticated_dau_assumed"],
                "cohort_state_local_reserved_bytes": int(local_cohort),
                "r2_reserved_bytes": cloud,
                "r2_reserved_gb": round(cloud / 1e9, 6),
                "local_reserved_bytes": local,
                "local_reserved_gib": round(local / 2**30, 3),
                "fits_collector_20gib_at_80pct": local
                <= p["collector_volume_gib"]
                * 2**30
                * p["collector_operational_volume_fraction"],
                "r2_cost_with_free_tier_available": r2_cost(
                    cloud,
                    p["r2_class_a_operations_budget_month"],
                    p["r2_class_b_operations_budget_month"],
                    p,
                    True,
                ),
                "r2_conservative_cost_without_free_tier": r2_cost(
                    cloud,
                    p["r2_class_a_operations_budget_month"],
                    p["r2_class_b_operations_budget_month"],
                    p,
                    False,
                ),
                "raw_events_in_supabase_bytes_7d_with_margin": local_raw,
            }
        )
    prom = (
        p["prometheus_new_series_target"]
        * 86400
        / p["prometheus_scrape_seconds"]
        * p["prometheus_retention_days_observed"]
        * p["prometheus_bytes_per_sample_estimate"]
        * p["prometheus_index_wal_factor_assumed"]
    )
    return {
        "assumptions": p,
        "pricing_checked_on": "2026-10-08",
        "pricing_sources": [
            "https://developers.cloudflare.com/r2/pricing/",
            "https://supabase.com/pricing",
            "https://prometheus.io/docs/prometheus/latest/storage/",
        ],
        "model_notes": [
            "GB decimal; GiB binary. Steady-state upper sizing envelope, not measured compression or actual billed daily peak.",
            "Every point/row sizing estimate already includes a 2x reserve, except explicitly fixed WAL/scratch and receipt budgets.",
            "No per-request successful access log storage: all traffic has counters/histograms; domain/presence signals are budgeted separately.",
            "Default anonymous traffic is assumed equal to authenticated DAU because real anonymous coverage is unknown.",
            "Cloud billable units round upward. Free allowance is shared; availability has not been verified for this account.",
            "Local infrastructure, operations labor, provider compute/network, taxes, optional traces and AI load tests are excluded from R2 prices.",
            "No full SQLite snapshots in R2: immutable raw/metric partitions plus three compact identity snapshots; restoration replays archives.",
            "Storage scenarios do not certify workload throughput or indicate users currently supported.",
            "v1.1: 40 signals/day and 320 bytes for bounded actor-day state; separate 35-day signup-cohort state at 192 bytes/account, assuming daily signups equal authenticated DAU. Not measured.",
            "500 global metric series include new product/data-quality metrics, not 500 per institution.",
        ],
        "cloud_fixed_reserved_bytes": int(cloud_fixed),
        "local_fixed_reserved_bytes": int(local_fixed),
        "additional_prometheus_bytes_estimate_with_3x_factor": int(prom),
        "scenarios": result,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--assumptions", type=Path)
    args = ap.parse_args()
    p = dict(DEFAULTS)
    if args.assumptions:
        overrides = json.loads(args.assumptions.read_text())
        unknown = overrides.keys() - p.keys()
        if unknown:
            raise ValueError("Unknown assumptions: " + ", ".join(sorted(unknown)))
        p.update(overrides)
    if (
        p["hourly_retention_total_days"] < p["five_minute_retention_days"]
        or p["sizing_multiplier"] < 1
        or p["anonymous_session_ratio"] < 0
        or p["new_accounts_per_authenticated_dau_assumed"] < 0
    ):
        raise ValueError("Invalid retention, reserve or actor ratio")
    print(json.dumps(calculate(p), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
