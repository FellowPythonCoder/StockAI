"""Procedural Synthetic Stock Universe & Random Company Generator Catalog.

Contains zero real-world public equities — every instrument, index, and sector benchmark
is a synthetic company generated for interactive AI candle forecasting and verification.
"""

from __future__ import annotations

import random
from typing import Any

SECTOR_ETF_BY_SECTOR: dict[str, str] = {
    "Quantum & Compute": "SQNT",
    "Neural Systems": "SNET",
    "Autonomous Robotics": "SROB",
    "Clean Grid & Fusion": "SNRG",
    "Programmable Biology": "SBIO",
    "Orbital Logistics": "SORB",
    "Algorithmic Clearing": "SFIN",
    "Metamaterials": "SMAT",
}

MARKET_INDICES: dict[str, dict[str, str]] = {
    "^MSX500": {"display": "MSX 500", "name": "MSX 500 Synthetic Composite"},
    "^QNT100": {"display": "QNT 100", "name": "QNT 100 Growth Index"},
    "^IND30": {"display": "IND 30", "name": "IND 30 Industrial Average"},
    "^SVIX": {"display": "SVIX", "name": "Synthetic Volatility Index"},
}

INITIAL_SYNTHETIC_STOCKS: dict[str, dict[str, Any]] = {
    "VELX": {
        "name": "Velox Quantum Systems",
        "exchange": "SYNTH-X",
        "asset_type": "Equity",
        "sector": "Quantum & Compute",
        "industry": "Cryogenic Photonic Processors",
        "seed": 1041,
        "regime": "momentum_up",
        "base_price": 168.0,
    },
    "KRNL": {
        "name": "Kernel Neural Labs",
        "exchange": "SYNTH-X",
        "asset_type": "Equity",
        "sector": "Neural Systems",
        "industry": "Sparse Inference Silicon",
        "seed": 2089,
        "regime": "momentum_up",
        "base_price": 224.0,
    },
    "AETH": {
        "name": "Aetherion Robotics",
        "exchange": "SYNTH-X",
        "asset_type": "Equity",
        "sector": "Autonomous Robotics",
        "industry": "Dexterous Industrial Actuators",
        "seed": 3117,
        "regime": "turnaround",
        "base_price": 94.0,
    },
    "NEXO": {
        "name": "Nexora Cloud Fabric",
        "exchange": "SYNTH-X",
        "asset_type": "Equity",
        "sector": "Quantum & Compute",
        "industry": "Distributed Mesh Compute",
        "seed": 4219,
        "regime": "mean_reverting",
        "base_price": 136.0,
    },
    "SLST": {
        "name": "Solstice Fusion Corp.",
        "exchange": "SYNTH-N",
        "asset_type": "Equity",
        "sector": "Clean Grid & Fusion",
        "industry": "Compact Tokamak Microgrids",
        "seed": 5303,
        "regime": "high_vol",
        "base_price": 78.0,
    },
    "CYPH": {
        "name": "Cypheris BioCompute",
        "exchange": "SYNTH-X",
        "asset_type": "Equity",
        "sector": "Programmable Biology",
        "industry": "Generative Protein Folding",
        "seed": 6421,
        "regime": "momentum_up",
        "base_price": 182.0,
    },
    "MRDN": {
        "name": "Meridian Orbital",
        "exchange": "SYNTH-N",
        "asset_type": "Equity",
        "sector": "Orbital Logistics",
        "industry": "Autonomous LEO Tug Fleet",
        "seed": 7529,
        "regime": "turnaround",
        "base_price": 62.0,
    },
    "OBLX": {
        "name": "Obelisk Clearing Corp.",
        "exchange": "SYNTH-N",
        "asset_type": "Equity",
        "sector": "Algorithmic Clearing",
        "industry": "Zero-Latency Settlement Rails",
        "seed": 8647,
        "regime": "mean_reverting",
        "base_price": 145.0,
    },
    "VRGX": {
        "name": "Verge Optical Logic",
        "exchange": "SYNTH-X",
        "asset_type": "Equity",
        "sector": "Metamaterials",
        "industry": "Waveguide Interconnects",
        "seed": 9733,
        "regime": "high_vol",
        "base_price": 112.0,
    },
    "HLIX": {
        "name": "Helix Cellular Works",
        "exchange": "SYNTH-X",
        "asset_type": "Equity",
        "sector": "Programmable Biology",
        "industry": "Synthetic Enzyme Foundry",
        "seed": 10853,
        "regime": "downtrend",
        "base_price": 88.0,
    },
    "STRT": {
        "name": "Strata Lattice Inc.",
        "exchange": "SYNTH-N",
        "asset_type": "Equity",
        "sector": "Metamaterials",
        "industry": "Graphene Thermal Composites",
        "seed": 11939,
        "regime": "momentum_up",
        "base_price": 129.0,
    },
    "ZENT": {
        "name": "Zenith CryoGrid",
        "exchange": "SYNTH-N",
        "asset_type": "Equity",
        "sector": "Clean Grid & Fusion",
        "industry": "Superconducting Transmission",
        "seed": 13007,
        "regime": "mean_reverting",
        "base_price": 104.0,
    },
    # Synthetic Benchmark & Sector ETFs
    "MSX": {
        "name": "MSX 500 Synthetic Market ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Broad Synthetic Market",
        "industry": "Broad Index Tracker",
        "seed": 90001,
        "regime": "momentum_up",
        "base_price": 510.0,
    },
    "QNTX": {
        "name": "QNT 100 Synthetic Growth ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Quantum & Compute",
        "industry": "Growth Index Tracker",
        "seed": 90002,
        "regime": "momentum_up",
        "base_price": 445.0,
    },
    "INDX": {
        "name": "IND 30 Synthetic Industrials ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Autonomous Robotics",
        "industry": "Industrial Index Tracker",
        "seed": 90003,
        "regime": "mean_reverting",
        "base_price": 388.0,
    },
    "SQNT": {
        "name": "Quantum & Compute Sector ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Quantum & Compute",
        "industry": "Sector Benchmark",
        "seed": 91001,
        "regime": "momentum_up",
        "base_price": 210.0,
    },
    "SNET": {
        "name": "Neural Systems Sector ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Neural Systems",
        "industry": "Sector Benchmark",
        "seed": 91002,
        "regime": "momentum_up",
        "base_price": 235.0,
    },
    "SROB": {
        "name": "Autonomous Robotics Sector ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Autonomous Robotics",
        "industry": "Sector Benchmark",
        "seed": 91003,
        "regime": "turnaround",
        "base_price": 148.0,
    },
    "SNRG": {
        "name": "Clean Grid & Fusion Sector ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Clean Grid & Fusion",
        "industry": "Sector Benchmark",
        "seed": 91004,
        "regime": "high_vol",
        "base_price": 122.0,
    },
    "SBIO": {
        "name": "Programmable Biology Sector ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Programmable Biology",
        "industry": "Sector Benchmark",
        "seed": 91005,
        "regime": "mean_reverting",
        "base_price": 164.0,
    },
    "SORB": {
        "name": "Orbital Logistics Sector ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Orbital Logistics",
        "industry": "Sector Benchmark",
        "seed": 91006,
        "regime": "turnaround",
        "base_price": 118.0,
    },
    "SFIN": {
        "name": "Algorithmic Clearing Sector ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Algorithmic Clearing",
        "industry": "Sector Benchmark",
        "seed": 91007,
        "regime": "mean_reverting",
        "base_price": 176.0,
    },
    "SMAT": {
        "name": "Metamaterials Sector ETF",
        "exchange": "SYNTH-ARC",
        "asset_type": "ETF",
        "sector": "Metamaterials",
        "industry": "Sector Benchmark",
        "seed": 91008,
        "regime": "momentum_up",
        "base_price": 154.0,
    },
}

COMPANY_PREFIXES = [
    "Kova", "Zora", "Prism", "Vortex", "Lumen", "Crux", "Novus", "Tesseract", "Quanta",
    "Vektor", "Pyro", "Cinder", "Aurelia", "Boreal", "Calyx", "Draco", "Echelon", "Flux",
    "Glint", "Hyperion", "Iridium", "Joule", "Kestrel", "Lyra", "Mythos", "Nimbus", "Onyx",
    "Parallax", "Quasar", "Rift", "Sable", "Talon", "Umbra", "Vesper", "Warden", "Xeno", "Yotta", "Zephyr",
]

SECTOR_INDUSTRIES: dict[str, list[tuple[str, str]]] = {
    "Quantum & Compute": [
        ("Quantum Logic", "Topological Qubit Arrays"),
        ("Photonic Compute", "Optical Tensor Cores"),
        ("Cryo-Silicon", "Sub-Kelvin Memory Stacks"),
    ],
    "Neural Systems": [
        ("Neural Labs", " Neuromorphic Edge Chips"),
        ("Cortex Systems", "Autonomous Reasoning Kernels"),
        ("Synapse Foundry", "Analog Inference Accelerators"),
    ],
    "Autonomous Robotics": [
        ("Robotics", "Humanoid Fleet Actuators"),
        ("Kinematics", "Precision Micro-Manipulators"),
        ("Field Dynamics", "Subterranean Inspection Drones"),
    ],
    "Clean Grid & Fusion": [
        ("Fusion Energy", "Magnetized Target Reactors"),
        ("Grid Storage", "Solid-State Vanadium Vaults"),
        ("Thermal Works", "Deep Geothermal Turbines"),
    ],
    "Programmable Biology": [
        ("BioCompute", "Cell-Free Enzyme Synthesis"),
        ("Genomics", "Targeted RNA Circuits"),
        ("Biologics", "Computational Antibody Design"),
    ],
    "Orbital Logistics": [
        ("Orbital", "Propellant Depot Tugs"),
        ("Spaceworks", "Reusable Payload Fairings"),
        ("Astro-Link", "Optical Laser Downlinks"),
    ],
    "Algorithmic Clearing": [
        ("Clearing", "Atomic Settlement Ledgers"),
        ("Treasury Tech", "Automated Liquidity Routing"),
        ("Quant Rails", "Cross-Venue Margin Engines"),
    ],
    "Metamaterials": [
        ("Lattice Corp.", "Acoustic Cloak Composites"),
        ("Photonics", "Metasurface Lens Arrays"),
        ("Materials", "Ultra-Dense Carbon Aerogels"),
    ],
}

# Avoid accidental collision with well-known real-world mega-cap symbols
FORBIDDEN_REAL_TICKERS = {
    "AAPL", "NVDA", "MSFT", "GOOG", "GOOGL", "AMZN", "TSLA", "META", "NFLX", "AMD",
    "INTC", "ORCL", "CRM", "ADBE", "CSCO", "QCOM", "AVGO", "TXN", "JPM", "BAC",
    "WFC", "GS", "MS", "V", "MA", "UNH", "JNJ", "LLY", "PFE", "MRK", "XOM", "CVX",
    "WMT", "COST", "HD", "DIS", "NKE", "MCD", "SBUX", "KO", "PEP", "SPY", "QQQ", "DIA", "IWM",
}


def make_unique_fictional_company(
    existing_tickers: set[str],
    rng: random.Random,
    sector: str | None = None,
    custom_ticker: str | None = None,
    custom_name: str | None = None,
    regime: str = "random",
) -> dict[str, Any]:
    sectors = list(SECTOR_INDUSTRIES.keys())
    chosen_sector = sector if sector in SECTOR_INDUSTRIES else rng.choice(sectors)
    suffix_label, industry = rng.choice(SECTOR_INDUSTRIES[chosen_sector])
    prefix = rng.choice(COMPANY_PREFIXES)
    corp_tail = rng.choice(["Systems", "Labs", "Corp.", "Holdings", "Technologies", "Dynamics", "Group"])
    name = custom_name.strip() if custom_name and custom_name.strip() else f"{prefix} {suffix_label} {corp_tail}".replace("Corp. Corp.", "Corp.")

    if custom_ticker and custom_ticker.strip():
        cand = "".join(ch for ch in custom_ticker.upper() if ch.isalpha())[:5]
        if len(cand) < 2:
            cand = "SYNX"
        if cand in FORBIDDEN_REAL_TICKERS:
            cand = f"{cand[:3]}X"
    else:
        consonants = "BCDFGHJKLMNPQRSTVWXZ"
        vowels = "AEIOUY"
        cand = ""
        for _ in range(80):
            base = (prefix[:2].upper() + rng.choice(consonants) + rng.choice("XZKVRNML"))[:4]
            if len(base) < 4:
                base = (base + rng.choice(vowels) + "X")[:4]
            if base not in existing_tickers and base not in FORBIDDEN_REAL_TICKERS:
                cand = base
                break
        if not cand:
            cand = f"SX{rng.randint(10, 99)}"

    actual_regime = (
        rng.choice(["momentum_up", "mean_reverting", "high_vol", "turnaround", "downtrend"])
        if regime == "random"
        else regime
    )

    return {
        "ticker": cand,
        "name": name,
        "exchange": rng.choice(["SYNTH-X", "SYNTH-N"]),
        "asset_type": "Equity",
        "sector": chosen_sector,
        "industry": industry.strip(),
        "seed": rng.randint(100_000, 9_999_999),
        "regime": actual_regime,
        "base_price": round(rng.uniform(42.0, 290.0), 2),
    }
