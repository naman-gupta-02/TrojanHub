"""Safety net for "never invent contact details": find emails/phones in an answer that don't
appear in any source Tommy was given."""

from __future__ import annotations

import re

from scripts.scrape.extract_contacts import EMAIL, PHONE


def _digits(phone: str) -> str:
    d = re.sub(r"\D", "", phone)
    return d[1:] if len(d) == 11 and d.startswith("1") else d


def unverified_contacts(answer: str, known_text: str) -> list[str]:
    known_emails = {e.lower() for e in EMAIL.findall(known_text)}
    known_phones = {_digits(p.group(0)) for p in PHONE.finditer(known_text)}
    bad = [e for e in EMAIL.findall(answer) if e.lower().rstrip(".") not in known_emails]
    bad += [p.group(0) for p in PHONE.finditer(answer) if _digits(p.group(0)) not in known_phones]
    return bad
