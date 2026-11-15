"""Pull contact details out of page text with regexes (ARCHITECTURE.md §7.1, step 3).

Tommy quotes emails, phone numbers, hours and addresses ONLY from what this finds, so it is
deliberately literal: it copies what the page says and never normalizes or guesses.
"""

from __future__ import annotations

import re

EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE = re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b")
DAY = r"(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?"
TIME = r"\d{1,2}(?::\d{2})?\s?(?:AM|PM|am|pm|a\.m\.|p\.m\.)"
HOURS_LINE = re.compile(rf"({DAY}.*{TIME}|{TIME}\s*[–-]\s*{TIME}|\b24 hours\b|{DAY}\s*[–&,-]\s*{DAY})", re.IGNORECASE)
ADDRESS = re.compile(r"\b\d{3,5}\s+(?:[NSEW]\.?\s+|South\s+|North\s+|West\s+|East\s+)?[A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*\s+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Way|Dr|Drive|Pl|Place|Rd|Road)\b\.?(?:[^\n]{0,40})")

_MD = re.compile(r"[*_`#>]|\\")


def _clean(line: str) -> str:
    line = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", line)  # [text](url) -> text
    return _MD.sub("", line).strip()


def extract_contacts(text: str) -> dict:
    """Returns {emails, phones: [{number, label}], hours, addresses}. Values are copied verbatim."""
    lines = [_clean(l) for l in text.splitlines()]
    emails: list[str] = []
    phones: list[dict] = []
    hours: list[str] = []
    addresses: list[str] = []

    last_label = ""
    for i, line in enumerate(lines):
        if not line:
            continue
        for e in EMAIL.findall(line):
            e = e.rstrip(".")
            if e not in emails:
                emails.append(e)
        for m in PHONE.finditer(line):
            number = m.group(0).strip()
            label = line[: m.start()].strip(" :–-|(") or last_label
            if not any(p["number"] == number for p in phones):
                phones.append({"number": number, "label": label[:80]})
        if HOURS_LINE.search(line) and len(line) < 160 and line not in hours:
            # keep the day line together with a following time-only line ("Tuesdays…" + "10:00 AM – 2:00 PM")
            nxt = next((l for l in lines[i + 1 :] if l), "")
            time_only = re.fullmatch(rf"{TIME}\s*[–-]\s*{TIME}", nxt)
            day_only = re.search(DAY, line, re.IGNORECASE) and not re.search(TIME, line)
            hours.append(f"{line}: {nxt}" if time_only and day_only else line)
        for a in ADDRESS.findall(line):
            a = a.strip(" ,")
            if a not in addresses:
                addresses.append(a)
        if not PHONE.search(line) and len(line) < 60:
            last_label = line  # e.g. "University Park Campus" above a bare number

    # drop time-only lines that were merged into the day line above them
    hours = [h for h in hours if not any(h != o and h in o for o in hours)]
    return {"emails": emails, "phones": phones, "hours": hours[:12], "addresses": addresses[:6]}


def all_contact_strings(contacts: dict) -> set[str]:
    """Flat set of emails + phone numbers, for checking that an answer only uses known contacts."""
    return set(contacts.get("emails", [])) | {p["number"] for p in contacts.get("phones", [])}
