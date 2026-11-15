"""Expo push notifications. Shared: P2 (Vishwa) calls send_push for Lost & Found match alerts.

    from app.notify.push import send_push
    send_push([profile["expo_push_token"]], "Possible match!", "A black Hydro Flask was found at Leavey", {"item_id": id})
"""

import httpx

EXPO_URL = "https://exp.host/--/api/v2/push/send"


def send_push(tokens: list[str | None], title: str, body: str, data: dict | None = None) -> int:
    """Sends to every valid Expo token; returns how many were accepted. Never raises."""
    valid = [t for t in tokens if t and t.startswith(("ExponentPushToken[", "ExpoPushToken["))]
    if not valid:
        return 0
    messages = [{"to": t, "title": title, "body": body, "data": data or {}, "sound": "default"} for t in valid]
    try:
        r = httpx.post(EXPO_URL, json=messages, timeout=15, headers={"Accept": "application/json"})
        tickets = r.json().get("data", []) if r.status_code < 300 else []
    except (httpx.HTTPError, ValueError):
        return 0
    return sum(1 for t in tickets if isinstance(t, dict) and t.get("status") == "ok")
