"""Tommy's tools (ARCHITECTURE.md §7.1): schemas sent to the LLM.

Each tool is a thin wrapper around another owner's endpoint. The wrappers will live in
tools/<feature>.py (Phase 1–2) and only call HTTP and map fields, with no feature logic.
"""

from typing import Any


def _fn(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }


TOOLS: list[dict] = [
    _fn(
        "search_usc_info",
        "Search official public USC pages (offices, hours, locations, contacts, policies). "
        "Use for any campus-info question.",
        {"query": {"type": "string", "description": "What to look up, rewritten as a clear search query"}},
        ["query"],
    ),
    _fn(
        "search_lost_items",
        "Search Lost & Found for items other students have found.",
        {
            "query": {"type": "string", "description": "Item description, e.g. 'black Hydro Flask with Trojans sticker'"},
            "building": {"type": "string", "description": "Building code or name where it was lost, if known"},
        },
        ["query"],
    ),
    _fn(
        "report_found_item",
        "Draft a found-item post for Lost & Found. Needs user confirmation before it's posted.",
        {
            "description": {"type": "string", "description": "What the item is"},
            "location": {"type": "string", "description": "Where it was found"},
            "image_url": {"type": "string", "description": "Uploaded photo URL, if the user sent one"},
        },
        ["description", "location"],
    ),
    _fn(
        "search_events",
        "Search campus and org events.",
        {
            "query": {"type": "string", "description": "What the student asked for, e.g. 'free pizza', 'career fair'"},
            "date_range": {"type": "string",
                           "description": "'today', 'this_week', 'next_week', or 'YYYY-MM-DD/YYYY-MM-DD'"},
            "category": {"type": "string",
                         "enum": ["free_food", "cultural", "career", "social", "academic", "sports"],
                         "description": "free_food = any event giving away food or drinks (snacks, coffee, hot "
                                        "chocolate, pizza…). Also matches events whose text fits the category."},
            "free_only": {"type": "boolean", "description": "Only events with free entry"},
            "freebie_only": {"type": "boolean", "description": "Only events that give away food or merch"},
        },
        ["query"],
    ),
    _fn(
        "search_deals",
        "Search active student deals and one-time freebies.",
        {"query": {"type": "string"}},
        ["query"],
    ),
    _fn(
        "get_rewards",
        "Attendance-reward programs: go to a set number of events (e.g. career events) to earn a perk, "
        "swag or a stamp. Returns each program, the student's progress and upcoming events that count.",
        {},
        [],
    ),
    _fn(
        "scan_flyer",
        "Read a flyer photo into an event or deal draft. Needs user confirmation before saving.",
        {"image_url": {"type": "string"}},
        ["image_url"],
    ),
    _fn(
        "save_event",
        "Save an event to the user's calendar, optionally registering. Needs user confirmation.",
        {"event_id": {"type": "string"}, "register": {"type": "boolean"}},
        ["event_id"],
    ),
    _fn(
        "log_complaint",
        "Draft a campus maintenance complaint (heat/AC, broken furniture, locks, Wi-Fi, cleaning...). "
        "Needs user confirmation before filing. Not for emergencies.",
        {
            "text": {"type": "string", "description": "The student's own words"},
            "building": {"type": "string", "description": "Building code or name, e.g. 'GFS'"},
            "room": {"type": "string"},
            "image_url": {"type": "string", "description": "The photo the student attached of the problem (photo://N), if any"},
        },
        ["text"],
    ),
]

# Tools that write data: always drafted first, then run via POST /chat/confirm.
WRITE_TOOLS = {"report_found_item", "scan_flyer", "save_event", "log_complaint"}

TOOL_NAMES = {t["function"]["name"] for t in TOOLS}
