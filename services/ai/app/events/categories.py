"""Which events belong under a category chip ("Free food", "Cultural", ...).

An event has one `category`, but plenty of events fit more than one chip. Open Mic Night is
"social" and hands out free hot chocolate, so it should show up under "Free food" too. An event
counts for a chip when its category matches, or when its title, description or freebie says so.
"""

from __future__ import annotations

import re

CATEGORIES = ("free_food", "cultural", "career", "social", "academic", "sports", "other")


def _words(*words: str) -> re.Pattern:
    # whole words, optional plural: "snack" also matches "snacks", "drink" matches "drinks"
    return re.compile(r"\b(" + "|".join(words) + r")(e?s)?\b", re.I)


# Food and drink an event might give away
_FOOD = _words(
    "food", "snack", "drink", "beverage", "refreshment", "meal", "breakfast", "brunch", "lunch", "dinner",
    "pizza", "boba", "tea", "chai", "coffee", "latte", "hot chocolate", "cocoa", "cider", "juice", "smoothie",
    "lemonade", "soda", "wing", "dumpling", "popcorn", "taco", "burrito", "burger", "bbq", "sandwich", "bagel",
    "donut", "doughnut", "cookie", "cake", "cupcake", "pastr(y|ie)", "dessert", "sweet", "candy", "ice cream",
    "fruit", "sushi", "ramen", "noodle", "samosa", "mochi", "churro", "crepe", "waffle", "pancake", "chip",
    "pretzel", "nacho", "fries", "treat",
)
# "Free pizza" in the title or description, for events that didn't tick "has a freebie"
_FREE_FOOD_TEXT = re.compile(r"\b(free|complimentary)\s+(\w+\s+)?" + _FOOD.pattern + r"|\b(food|refreshments?|snacks?) (will be )?(provided|served)\b", re.I)

_KEYWORDS: dict[str, re.Pattern] = {
    "cultural": _words(
        "cultur(e|al)", "heritage", "diwali", "holi", "lunar new year", "eid", "ramadan", "nowruz", "hanukkah",
        "kwanzaa", "dia de los muertos", "día de los muertos", "diaspora", "international", "traditional", "folk",
        "festival", "garba", "bhangra", "lion dance", "black history", "latinx", "pride", "language exchange",
    ),
    "career": _words(
        "career", "recruit(ing|er|ment)?", "internship", "resume", "résumé", "interview", "networking", "hiring",
        "job", "employer", "linkedin", "professional", "industry",
    ),
    "social": _words(
        "social", "mixer", "party", "game night", "karaoke", "open mic", "trivia", "bingo", "meetup", "hangout",
        "movie night", "concert", "study break", "welcome", "formal",
    ),
    "academic": _words(
        "lecture", "seminar", "workshop", "talk", "symposium", "colloquium", "research", "panel", "office hour",
        "tutoring", "study session", "book club", "hackathon", "thesis", "conference",
    ),
    "sports": _words(
        "sport", "football", "basketball", "soccer", "volleyball", "baseball", "softball", "tennis", "water polo",
        "track meet", "swim meet", "yoga", "5k", "marathon", "fitness", "intramural", "tailgate", "athletic",
        "workout", "hike", "hiking", "pickleball", "climbing", "game day",
    ),
}


def matches(event: dict, category: str | None) -> bool:
    """True if the event belongs under this chip (no category = every event)."""
    if not category:
        return True
    if event.get("category") == category:
        return True
    text = " ".join(filter(None, [event.get("title"), event.get("description")]))
    if category == "free_food":
        freebie = event.get("freebie_desc") if event.get("has_freebie") else None
        return bool((freebie and _FOOD.search(freebie)) or _FREE_FOOD_TEXT.search(text))
    pattern = _KEYWORDS.get(category)
    return bool(pattern and pattern.search(text))
