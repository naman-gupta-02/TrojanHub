"""Flyer reader (ARCHITECTURE.md §7.3): flyer photo -> event/deal fields for an editable form.

The vision LLM only reads the flyer. Everything that has to be right is decided here in
code: dates are resolved in LA time, buildings come from our own table, categories are
checked against the enum, and "free food" is double-checked with a keyword pass.
"""

import base64
import ipaddress
import json
import re
import socket
from datetime import datetime, timedelta
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.core.llm import get_vision_client, model_name
from app.events import dedupe, store
from app.events.dates import LA, iso, now_utc, parse_ts

CATEGORIES = ("cultural", "career", "free_food", "sports", "social", "academic", "other")
FIELDS = ("title", "starts_at", "ends_at", "location_text", "building_id", "is_free", "has_freebie",
          "freebie_desc", "register_url", "org_name", "category")
MAX_IMAGE_BYTES = 8 * 1024 * 1024

PROMPT = """You read photos of campus flyers at the University of Southern California (USC).
Today is {today} ({weekday}), and the local time is {now} in Los Angeles.

Return ONE JSON object, nothing else:
{{
  "is_flyer": true if this image is an event flyer, poster, or promo for a deal/freebie,
  "type": "event" (happens at a time and place) or "deal" (a discount/offer/promo code you claim),
  "title": short title as printed (fix ALL-CAPS to Title Case),
  "description": 1-2 plain sentences on what it is, or null,
  "starts_at": "YYYY-MM-DDTHH:MM" local Los Angeles time, or null,
  "ends_at": "YYYY-MM-DDTHH:MM" local Los Angeles time, or null,
  "year_on_flyer": true only if the year is printed,
  "location_text": place as printed, e.g. "TCC Grand Ballroom", or null,
  "building_code": one code from the list below if the place is clearly in that building, else null,
  "is_free": true if attending is free, false if it costs money, null if unclear,
  "has_freebie": true if they give away something (food, drinks, merch, swag, raffle prizes),
  "freebie_desc": what is given away, e.g. "Free pizza and boba", or null,
  "register_url": RSVP/registration link as printed (not a QR code), or null,
  "ticket_url": ticket link as printed, or null,
  "tickets_open_at": "YYYY-MM-DDTHH:MM" if the flyer says when tickets go on sale, else null,
  "org_name": the hosting student org / office, or null,
  "category": one of {categories},
  "how_to_claim": for deals, how to get it (e.g. "Show your USCard"), else null,
  "confidence": {{"<field>": number 0..1 for each field above that you filled}}
}}

Rules:
- Never invent anything. If it is not printed on the flyer, use null.
- Dates without a year mean the next time that date happens on or after today.
- "7-9pm" means starts_at 19:00 and ends_at 21:00 on that date. "Noon" is 12:00.
- category "free_food" only when free food is the main point of the event.
- Lower the confidence for text that is small, blurry, cut off, or handwritten.

USC buildings (code: name):
{buildings}"""


def _is_public_host(url: str) -> bool:
    """False for localhost, private networks and anything that doesn't resolve: the server must
    not fetch internal addresses just because a client sent the link."""
    host = urlparse(url).hostname
    if not host:
        return False
    if host == urlparse(settings.supabase_url).hostname:
        return True  # our own Storage (flyers uploaded through /flyers/upload)
    try:
        addresses = {info[4][0].split("%")[0] for info in socket.getaddrinfo(host, None)}
        return bool(addresses) and all(ipaddress.ip_address(a).is_global for a in addresses)
    except (OSError, ValueError):
        return False


def _image_payload(image_url: str) -> str:
    """Send the image itself (data URL), so local proxies and private buckets work too."""
    if image_url.startswith("data:image/"):
        header, _, data = image_url.partition(",")
        if ";base64" not in header or not data:
            raise HTTPException(422, detail={"code": "bad_image_url", "message": "That photo couldn't be read. Try another one."})
        if len(data) * 3 // 4 > MAX_IMAGE_BYTES:
            raise HTTPException(413, detail={"code": "image_too_large", "message": "Flyer photo must be under 8 MB"})
        return image_url
    if not image_url.startswith(("http://", "https://")):
        raise HTTPException(422, detail={"code": "bad_image_url", "message": "image_url must be http(s) or a data:image URL"})
    blocked = HTTPException(422, detail={"code": "bad_image_url", "message": "That image link can't be used. Upload the photo instead."})
    try:
        url = image_url
        for _ in range(4):  # follow a few redirects by hand, checking every hop
            if not _is_public_host(url):
                raise blocked
            r = httpx.get(url, timeout=20, follow_redirects=False)
            if not (r.is_redirect and r.headers.get("location")):
                break
            url = str(r.url.join(r.headers["location"]))
        else:
            raise blocked
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(422, detail={"code": "image_unreachable", "message": f"Couldn't download the flyer: {e}"}) from e
    if len(r.content) > MAX_IMAGE_BYTES:
        raise HTTPException(413, detail={"code": "image_too_large", "message": "Flyer photo must be under 8 MB"})
    mime = r.headers.get("content-type", "image/jpeg").split(";")[0]
    if not mime.startswith("image/"):
        mime = "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(r.content).decode()}"


def _ask_llm(image: str, buildings: list[dict]) -> dict:
    now = now_utc().astimezone(LA)
    prompt = PROMPT.format(
        today=now.strftime("%Y-%m-%d"), weekday=now.strftime("%A"), now=now.strftime("%H:%M"),
        categories=", ".join(CATEGORIES),
        buildings="\n".join(f"{b['code']}: {b['name']}" for b in buildings),
    )
    messages = [{"role": "user", "content": [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": image}},
    ]}]
    client, model = get_vision_client(), model_name(vision=True)
    try:
        try:
            res = client.chat.completions.create(model=model, messages=messages, temperature=0,
                                                 response_format={"type": "json_object"})
        except Exception as e:
            # some OpenAI-compatible proxies don't support response_format; the prompt still asks for JSON
            if "response_format" not in str(e) and "json" not in str(e).lower():
                raise
            res = client.chat.completions.create(model=model, messages=messages, temperature=0)
    except Exception as e:
        raise HTTPException(502, detail={"code": "llm_error", "message": f"The flyer reader is unavailable: {e}"}) from e
    return parse_json(res.choices[0].message.content or "")


def parse_json(text: str) -> dict:
    """Model output -> dict, tolerating ```json fences and chatter around the object."""
    match = re.search(r"\{.*\}", text, re.S)
    try:
        data = json.loads(match.group(0) if match else text)
    except json.JSONDecodeError as e:
        raise HTTPException(502, detail={"code": "llm_bad_json", "message": "The flyer reader returned unreadable output"}) from e
    if not isinstance(data, dict):
        raise HTTPException(502, detail={"code": "llm_bad_json", "message": "The flyer reader returned unreadable output"})
    return data


# ---------------------------------------------------------------------------
# Normalizing what the model said
# ---------------------------------------------------------------------------
_FREEBIE = re.compile(
    r"\bfree\s+(food|pizza|boba|snacks?|lunch|dinner|breakfast|drinks?|coffee|tacos?|donuts?|cookies?|"
    r"merch|t-?shirts?|shirts?|swag|giveaways?|stickers?|tote\s?bags?)\b"
    r"|\b(food|refreshments|snacks|pizza|lunch|dinner) (will be )?(provided|served)\b",
    re.I,
)


def _text(value) -> str | None:
    if value is None:
        return None
    s = re.sub(r"\s+", " ", str(value)).strip()
    if not s or s.lower() in {"null", "none", "n/a", "tbd", "tba"}:
        return None
    return s


def _bool(value) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.lower() in {"true", "yes"}:
        return True
    if isinstance(value, str) and value.lower() in {"false", "no"}:
        return False
    return None


def _url(value) -> str | None:
    s = _text(value)
    if not s or " " in s or "." not in s:
        return None
    return s if re.match(r"https?://", s, re.I) else f"https://{s}"


def _when(value, year_on_flyer: bool) -> datetime | None:
    s = _text(value)
    if not s:
        return None
    try:
        dt = parse_ts(s)
    except ValueError:
        return None
    # no year printed and the date already passed -> it's next year's
    if not year_on_flyer and dt < now_utc() - timedelta(days=1):
        try:
            dt = dt.replace(year=dt.year + 1)
        except ValueError:  # Feb 29
            pass
    return dt


# What students actually write on flyers -> building code (checked longest first)
ALIASES = {
    "tutor campus center": "TCC", "campus center": "TCC", "tutor center": "TCC", "ground zero": "TCC",
    "tutor hall": "RTH", "leavey": "LVL", "doheny": "DML", "taper": "THH", "olin": "OHE", "kaprielian": "KAP",
    "fertitta": "JFF", "waite phillips": "WPH", "zumberge": "ZHS", "seeley mudd": "SGM", "annenberg": "ASC",
    "lyon center": "LRC", "lyon rec": "LRC", "usc village": "VIL", "the village": "VIL", "village": "VIL",
}


def match_building(code: str | None, location: str | None, buildings: list[dict]) -> str | None:
    by_code = {b["code"].upper(): b for b in buildings}
    if code and code.upper() in by_code:
        return by_code[code.upper()]["id"]
    if not location:
        return None
    loc = location.lower()
    for b in buildings:  # code as its own word ("SAL 101", "TCC Ballroom")
        if re.search(rf"\b{re.escape(b['code'].lower())}\b", loc):
            return b["id"]
    for b in sorted(buildings, key=lambda b: -len(b["name"])):
        if b["name"].lower() in loc:
            return b["id"]
    for alias in sorted(ALIASES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(alias)}\b", loc) and ALIASES[alias] in by_code:
            return by_code[ALIASES[alias]]["id"]
    for b in buildings:  # distinctive first word: "Leavey", "Doheny", "Taper"...
        first = b["name"].split()[0].lower()
        if len(first) >= 5 and first not in {"ronald", "seeley", "wallis"} and re.search(rf"\b{first}\b", loc):
            return b["id"]
    return None


def normalize(raw: dict, buildings: list[dict]) -> dict:
    """Model JSON -> FlyerScanResponse (+ optional confidence / extra)."""
    year_printed = bool(_bool(raw.get("year_on_flyer")))
    starts = _when(raw.get("starts_at"), year_printed)
    ends = _when(raw.get("ends_at"), year_printed)
    if starts and ends and ends <= starts:
        # "10pm-1am" is read as ending the same day; it really ends the next morning
        ends = ends + timedelta(days=1) if ends + timedelta(days=1) > starts else None
    location = _text(raw.get("location_text"))
    category = _text(raw.get("category"))
    category = category.lower().replace(" ", "_") if category else None
    raw_conf = raw.get("confidence") if isinstance(raw.get("confidence"), dict) else {}

    fields = {
        "title": _text(raw.get("title")),
        "starts_at": iso(starts),
        "ends_at": iso(ends),
        "location_text": location,
        "building_id": match_building(_text(raw.get("building_code")), location, buildings),
        "is_free": _bool(raw.get("is_free")),
        "has_freebie": _bool(raw.get("has_freebie")),
        "freebie_desc": _text(raw.get("freebie_desc")),
        "register_url": _url(raw.get("register_url")),
        "org_name": _text(raw.get("org_name")),
        "category": category if category in CATEGORIES else ("other" if category else None),
    }

    confidence: dict[str, float] = {}
    for f in FIELDS:
        if fields[f] is None:
            continue
        try:
            # the model scores "building_code"; our field is building_id. Anything unscored gets 0.7.
            default = raw_conf.get("building_code", 0.7) if f == "building_id" else 0.7
            confidence[f] = round(min(max(float(raw_conf.get(f, default)), 0.0), 1.0), 2)
        except (TypeError, ValueError):
            confidence[f] = 0.7
    if fields["starts_at"] and not year_printed:
        confidence["starts_at"] = min(confidence.get("starts_at", 0.7), 0.85)

    # Keyword safety net: the model sometimes misses "free pizza" in small print
    blob = " ".join(str(raw.get(k) or "") for k in ("title", "description", "freebie_desc", "how_to_claim"))
    hit = _FREEBIE.search(blob)
    if hit and not fields["has_freebie"]:
        fields["has_freebie"] = True
        fields["freebie_desc"] = fields["freebie_desc"] or hit.group(0).capitalize()
        confidence["has_freebie"] = 0.6
    if fields["has_freebie"] is None:
        fields["has_freebie"] = False
    if not fields["has_freebie"]:
        fields["freebie_desc"] = None

    not_needed = {"building_id"} | ({"freebie_desc"} if not fields["has_freebie"] else set())
    missing = [f for f in FIELDS if fields[f] is None and f not in not_needed]
    kind = "deal" if _text(raw.get("type")) == "deal" else "event"
    return {
        "type": kind,
        "fields": fields,
        "missing": missing,
        "confidence": confidence,
        "extra": {
            "description": _text(raw.get("description")),
            "ticket_url": _url(raw.get("ticket_url")),
            "tickets_open_at": iso(_when(raw.get("tickets_open_at"), year_printed)),
            "how_to_claim": _text(raw.get("how_to_claim")),
        },
    }


def scan(image_url: str) -> dict:
    buildings = store.buildings()
    raw = _ask_llm(_image_payload(image_url), buildings)
    if _bool(raw.get("is_flyer")) is False:
        raise HTTPException(422, detail={"code": "not_a_flyer", "message": "That doesn't look like a flyer. Try a clearer, straight-on photo."})
    result = normalize(raw, buildings)
    f = result["fields"]
    if result["type"] == "event":
        dup = dedupe.find_duplicate(f["title"], f["starts_at"], f["location_text"])
        if dup:
            result["duplicate_of"] = dup["id"]
            result["duplicate"] = {"id": dup["id"], "title": dup["title"], "starts_at": dup["starts_at"]}
    return result
