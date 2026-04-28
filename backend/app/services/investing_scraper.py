"""
Investing.com Economic Calendar Scraper
Pakai endpoint AJAX yang dipakai UI mereka sendiri — tidak perlu parse HTML kompleks.
Reliable selama mereka tidak ubah endpoint (biasanya stabil tahunan).

Fallback order:
  1. Scrape Investing.com (primary)
  2. Hardcode FOMC/CPI/NFP (fallback)
"""
import httpx
import re
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional
from app.core.logging import get_logger

log = get_logger(__name__)

INV_URL = "https://www.investing.com/economic-calendar/Service/getCalendarFilteredData"
INV_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://www.investing.com/economic-calendar/",
    "Origin": "https://www.investing.com",
}

# Country codes di Investing.com
# 5 = US, 17 = Eurozone, 4 = UK, 35 = Japan, 14 = China
COUNTRIES_IMPORTANT = ["5"]  # US only dulu — paling impact ke crypto


async def scrape_investing_calendar(days_ahead: int = 7) -> Optional[List[Dict]]:
    """
    Scrape dari Investing.com AJAX endpoint.
    Return list of event dicts, atau None jika gagal.
    """
    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days_ahead)

    # Investing pakai format yyyy-mm-dd
    date_from = now.strftime("%Y-%m-%d")
    date_to = end.strftime("%Y-%m-%d")

    data = {
        "country[]": COUNTRIES_IMPORTANT,
        "importance[]": ["2", "3"],  # 2 = medium, 3 = high (1 = low, skip)
        "timeZone": "55",              # GMT+0
        "timeFilter": "timeRemain",
        "currentTab": "custom",
        "submitFilters": "1",
        "limit_from": "0",
        "dateFrom": date_from,
        "dateTo": date_to,
    }

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            r = await client.post(INV_URL, data=data, headers=INV_HEADERS)
            r.raise_for_status()
            payload = r.json()
    except Exception as e:
        log.warning(f"Investing.com fetch failed: {e}")
        return None

    html = payload.get("data", "")
    if not html:
        return None

    events = parse_investing_html(html)
    log.info(f"Investing.com: {len(events)} events scraped")
    return events


def parse_investing_html(html: str) -> List[Dict]:
    """
    Parse HTML table rows yang dikembalikan Investing.com.
    Struktur: setiap event ada di <tr id="eventRowId_xxx">.
    """
    events: List[Dict] = []

    # Split ke per-row
    row_pattern = re.compile(r'<tr\s+id="eventRowId_(\d+)".*?</tr>', re.S)
    for match in row_pattern.finditer(html):
        row_html = match.group(0)
        try:
            ev = parse_single_event(row_html)
            if ev:
                events.append(ev)
        except Exception as e:
            continue

    return sorted(events, key=lambda x: x["event_time"])


def parse_single_event(row_html: str) -> Optional[Dict]:
    """Parse satu <tr> event dari Investing HTML"""

    # Timestamp — attribute data-event-datetime atau data-timestamp
    ts_match = re.search(r'data-event-datetime="([^"]+)"', row_html)
    if not ts_match:
        ts_match = re.search(r'data-timestamp="(\d+)"', row_html)
        if ts_match:
            ts = int(ts_match.group(1))
            event_time = datetime.fromtimestamp(ts, tz=timezone.utc)
        else:
            return None
    else:
        # Format: "2026/04/15 18:00:00"
        try:
            event_time = datetime.strptime(ts_match.group(1), "%Y/%m/%d %H:%M:%S")
            event_time = event_time.replace(tzinfo=timezone.utc)
        except Exception:
            return None

    # Impact — cari class grayFullBullishIcon / bull3
    impact_count = row_html.count("grayFullBullishIcon") + row_html.count("bull3")
    if impact_count >= 3:
        impact = "HIGH"
    elif impact_count == 2:
        impact = "MEDIUM"
    else:
        # Try alt: sentiment
        high_classes = re.search(r'(bull3|grayFullBullishIcon)', row_html)
        impact = "MEDIUM" if high_classes else "LOW"

    # Title — cari dalam <a class="event">...</a> atau <td class="event">
    title_match = re.search(r'<a[^>]*>([^<]+)</a>', row_html)
    if not title_match:
        title_match = re.search(r'<td class="[^"]*event[^"]*"[^>]*>\s*([^<]+)', row_html)
    title = title_match.group(1).strip() if title_match else ""
    title = re.sub(r'\s+', ' ', title)

    if not title:
        return None

    # Currency — dari data-country atau class flag
    curr_match = re.search(r'<td class="[^"]*flagCur[^"]*"[^>]*>\s*<span[^>]*title="([^"]+)"', row_html)
    currency = "USD"
    if curr_match:
        c = curr_match.group(1).strip()
        if c:
            # United States → USD
            country_map = {
                "United States": "USD", "Euro Zone": "EUR",
                "United Kingdom": "GBP", "Japan": "JPY",
                "China": "CNY", "Canada": "CAD", "Australia": "AUD",
            }
            currency = country_map.get(c, c[:3].upper())

    # Actual / Forecast / Previous
    actual_m = re.search(r'<td class="[^"]*act[^"]*"[^>]*>\s*([^<]*?)\s*</td>', row_html)
    forecast_m = re.search(r'<td class="[^"]*fore[^"]*"[^>]*>\s*([^<]*?)\s*</td>', row_html)
    previous_m = re.search(r'<td class="[^"]*prev[^"]*"[^>]*>\s*([^<]*?)\s*</td>', row_html)

    actual = (actual_m.group(1).strip() if actual_m else "").replace("&nbsp;", "")
    forecast = (forecast_m.group(1).strip() if forecast_m else "").replace("&nbsp;", "")
    previous = (previous_m.group(1).strip() if previous_m else "").replace("&nbsp;", "")

    return {
        "title": title,
        "currency": currency,
        "impact": impact,
        "event_time": event_time.isoformat(),
        "actual": actual,
        "forecast": forecast,
        "previous": previous,
        "source": "investing.com",
    }
