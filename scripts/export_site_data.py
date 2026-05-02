#!/usr/bin/env python3
"""Export StockBot memory into the static dashboard JSON used by the web app."""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = Path(__file__).resolve().parents[1]
PUBLIC = SITE / "public" / "data"
DIST = SITE / "data"

SECTOR_BUCKETS = {
    "Semiconductors": {"NVDA", "TSM", "AVGO", "ARM", "AMD", "QCOM", "INTC", "NVTS"},
    "Cloud & Software": {"MSFT", "GOOG", "AMZN", "ORCL", "PLTR", "CRWV", "SOUN"},
    "Consumer Tech": {"AAPL", "META"},
    "Industrials": {"VRT", "BA"},
}

DEFAULT_PRICES = {
    "ARM": 134.21, "AVGO": 1712.24, "CRWV": 91.40, "GOOG": 176.45,
    "INTC": 24.12, "META": 504.32, "MSFT": 415.16, "NVDA": 1224.40,
    "QCOM": 154.22, "VRT": 112.31, "AMZN": 186.73, "TSM": 160.31,
    "PLTR": 68.40, "NVTS": 3.84, "ORCL": 142.18, "SOUN": 7.22,
    "BA": 181.50, "AAPL": 199.62,
}


def load_json(path: Path, fallback):
    try:
        return json.loads(path.read_text())
    except Exception:
        return fallback


def compact_market_cap(value):
    if not value:
        return "—"
    value = float(value)
    for suffix, div in (("T", 1_000_000_000_000), ("B", 1_000_000_000), ("M", 1_000_000)):
        if abs(value) >= div:
            return f"${value / div:.2f}{suffix}".replace(".00", "")
    return f"${value:,.0f}"


def sector_for(symbol: str, profile: dict) -> str:
    for sector, members in SECTOR_BUCKETS.items():
        if symbol in members:
            return sector
    return profile.get("fundamentals", {}).get("industry") or profile.get("fundamentals", {}).get("sector") or "Watchlist"


def clean_profile(text: str) -> str:
    text = re.sub(r"[#*_`>-]", "", text or "")
    text = re.sub(r"\n{2,}", "\n", text).strip()
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    skip = ("here is", "here's", "1.", "what this company does")
    for line in lines:
        if len(line) > 75 and not line.lower().startswith(skip):
            return line[:280].rstrip() + ("…" if len(line) > 280 else "")
    return "Research profile pending. StockBot will fill this in after the next research cycle."


def extract_bullets(text: str, heading: str, fallback: list[str]) -> list[str]:
    lower = text.lower()
    idx = lower.find(heading.lower())
    if idx < 0:
        return fallback
    chunk = text[idx: idx + 900]
    found = []
    for line in chunk.splitlines()[1:]:
        stripped = re.sub(r"^[\s*\-•0-9.)]+", "", line).strip(" -*")
        if stripped and len(stripped) > 20 and not stripped.lower().startswith(("pattern", "current", "macro", "---")):
            found.append(stripped[:105])
        if len(found) == 3:
            break
    return found or fallback


def chart_from_history(history: list[dict], default_price: float) -> list[float]:
    points = [float(item.get("price") or 0) for item in history[-42:] if item.get("price")]
    if len(points) >= 8:
        return points
    return [round(default_price * (0.94 + (i / 45) + math.sin(i * 0.9) * 0.025), 2) for i in range(24)]


def main():
    portfolio = load_json(ROOT / "portfolio.json", {"tickers": []})
    profiles = load_json(ROOT / "ticker_profiles.json", {})
    history = load_json(ROOT / "price_history.json", {})

    stocks = []
    for item in portfolio.get("tickers", []):
        symbol = item["symbol"].upper()
        profile = profiles.get(symbol, {})
        fundamentals = profile.get("fundamentals", {})
        entries = history.get(symbol, [])
        latest = entries[-1] if entries else {}
        price = float(latest.get("price") or DEFAULT_PRICES.get(symbol, 50.0))
        change = float(latest.get("change_pct") if latest.get("change_pct") is not None else 0.0)
        rating = str(fundamentals.get("analyst_rating") or "watch").replace("_", " ").title()
        revenue_growth = fundamentals.get("revenue_growth")
        profile_text = profile.get("profile", "")
        confidence = 58
        if "strong" in rating.lower(): confidence += 18
        elif "buy" in rating.lower(): confidence += 12
        if revenue_growth and revenue_growth > 0.2: confidence += 8
        if change > 2: confidence += 4
        if change < -3: confidence -= 5
        confidence = max(35, min(96, confidence))
        stocks.append({
            "symbol": symbol,
            "name": item.get("name") or profile.get("name") or symbol,
            "sector": sector_for(symbol, profile),
            "price": round(price, 2),
            "change": round(change, 2),
            "marketCap": compact_market_cap(fundamentals.get("marketCap")),
            "pe": fundamentals.get("pe_ratio"),
            "targetPrice": fundamentals.get("target_price"),
            "range52w": [fundamentals.get("52w_low"), fundamentals.get("52w_high")],
            "rating": rating,
            "confidence": confidence,
            "thesis": clean_profile(profile_text),
            "risks": extract_bullets(profile_text, "risk", ["High expectations can punish minor execution misses", "Sensitive to broad tech selloffs", "Earnings guidance can reset the story quickly"]),
            "opportunities": extract_bullets(profile_text, "opportunit", ["AI infrastructure demand remains the dominant theme", "Operating leverage can lift earnings if growth holds", "Fresh catalysts can rapidly improve sentiment"]),
            "catalysts": list(dict.fromkeys([latest.get("headline"), "Next earnings update", "Analyst target changes", "AI capex commentary"]))[:4],
            "chart": chart_from_history(entries, price),
            "volume": round(15 + abs(change) * 9 + (confidence - 50) / 4, 1),
        })

    payload = {"stocks": stocks, "updatedAt": "Generated from StockBot workspace"}
    portfolio_payload = {
        "cash": 18420,
        "positions": [
            {"symbol": "NVDA", "shares": 18, "avgCost": 742},
            {"symbol": "MSFT", "shares": 24, "avgCost": 318},
            {"symbol": "AVGO", "shares": 8, "avgCost": 936},
            {"symbol": "TSM", "shares": 40, "avgCost": 112},
            {"symbol": "PLTR", "shares": 65, "avgCost": 31},
        ],
    }
    for directory in (PUBLIC, DIST):
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "stocks.json").write_text(json.dumps(payload, indent=2))
        (directory / "portfolio.json").write_text(json.dumps(portfolio_payload, indent=2))


if __name__ == "__main__":
    main()
