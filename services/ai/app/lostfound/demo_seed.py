"""Reset the Lost & Found demo data (P2, ARCHITECTURE.md §10 Phase 3: "Seed 15 realistic items").

Deletes everything the demo finder account posted (items and their photos), then posts DEMO_ITEMS
through the same code as POST /items, so every item gets a real AI tier ("at DPS" for valuables,
"left where found" otherwise), title and search embeddings. Safe to re-run any time.

Run from services/ai:
    python -m app.lostfound.demo_seed                          # photos from demo_photos/ (see CREDITS.md)
    python -m app.lostfound.demo_seed --photos ~/Desktop/lf    # your own <key>.jpg/.png/.jpeg instead
    python -m app.lostfound.demo_seed --no-photos              # descriptions only

The finder account must exist (default p2-lostfound-test@usc.edu). Use a different account to
claim items in the demo: you can't claim your own post.
No black Hydro Flask on purpose: the demo snaps a real one live and it must be the top match.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.core.supabase import get_supabase
from app.lostfound import items

# key (photo file name), description (matches the photo in demo_photos/), where it was found.
# No photo for hoodie, tumbler, keys (no good free photo) or id_card (ID photos are never stored).
DEMO_ITEMS: list[tuple[str, str, str]] = [
    ("hoodie", "Gray USC hoodie, size M", "SAL 101"),
    ("umbrella", "Yellow umbrella", "Leavey Library entrance"),
    ("jacket", "Navy hooded puffer jacket", "Taper Hall, 2nd floor"),
    ("charger", "White USB cable and a small power bank", "Leavey Library, 2nd floor study tables"),
    ("textbook", "Calculus textbook", "THH 101"),
    ("notebook", "Spiral notebook with ECON notes", "Fertitta Hall, room 102"),
    ("cap", "Black baseball cap with a red logo", "Lyon Center lobby"),
    ("tumbler", "Light blue Yeti tumbler", "Ronald Tutor Campus Center food court"),
    ("backpack", "Black Fjallraven Kanken backpack", "Doheny Library reading room"),
    ("lunchbox", "Navy lunch box", "USC Village dining hall"),
    ("airpods", "White AirPods Pro case", "Ronald Tutor Campus Center, near the stairs"),
    ("wallet", "Brown leather card wallet", "Doheny Library, 1st floor"),
    ("keys", "Car keys on a Trojan keychain", "Olin Hall of Engineering lobby"),
    ("id_card", "USC student ID card", "Kaprielian Hall, room 140"),
    ("glasses", "Black-framed glasses", "Waite Phillips Hall, 3rd floor"),
]

PHOTO_EXTS = (".jpg", ".jpeg", ".png")
DEMO_PHOTOS = Path(__file__).parent / "demo_photos"  # public domain / CC0, see demo_photos/CREDITS.md


def _user_id(email: str) -> str:
    users = get_supabase().auth.admin.list_users(page=1, per_page=1000)
    for u in users:
        if (u.email or "").lower() == email.lower():
            return u.id
    raise SystemExit(f"No account {email}. Create it first (see the P2 notes in .env).")


def _clear(user_id: str) -> int:
    sb = get_supabase()
    rows = sb.table("items").select("id,photo_url").eq("posted_by", user_id).execute().data or []
    if rows:
        paths = {f"items/{r['id']}.jpg" for r in rows} | {p for r in rows if (p := items.photo_path(r["photo_url"]))}
        sb.storage.from_(items.BUCKET).remove(sorted(paths))
        sb.table("items").delete().eq("posted_by", user_id).execute()
    return len(rows)


def _photo(folder: Path | None, key: str) -> bytes | None:
    if not folder:
        return None
    for ext in PHOTO_EXTS:
        if (p := folder / f"{key}{ext}").exists():
            return p.read_bytes()
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description="Reset Lost & Found demo data")
    ap.add_argument("--email", default="p2-lostfound-test@usc.edu", help="finder account that posts the demo items")
    ap.add_argument("--photos", type=Path, default=DEMO_PHOTOS, help="folder with photos named like hoodie.jpg, airpods.jpg …")
    ap.add_argument("--no-photos", action="store_true", help="post descriptions only")
    args = ap.parse_args()
    photos = None if args.no_photos else args.photos

    uid = _user_id(args.email)
    print(f"Removed {_clear(uid)} old item(s) posted by {args.email}\n")

    for key, description, where in DEMO_ITEMS:
        photo = _photo(photos, key)
        res = items.create_item(
            user_id=uid, kind="found", photo=photo, description=description, building_id=None, location_text=where
        )
        it = res["item"]
        flags = " (asks finder)" if res.get("ask_tier") else ""
        print(f"  {it['title']:<13} {res['tier']:<9}{flags:<14} {'photo' if photo else 'no photo':<8}  {where}")
    print(f"\nPosted {len(DEMO_ITEMS)} demo items.")


if __name__ == "__main__":
    main()
