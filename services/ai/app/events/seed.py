"""P3 demo data: orgs, 20 upcoming events, 3 past ones, 9 deals, 2 reward programs, a demo user.

    cd services/ai && python -m app.events.seed

Safe to re-run: fixed ids + upsert. Every time is relative to *now*, so re-running on demo
morning keeps "5 freebies today", a ticket sale opening in 30 min, and an event you can check
in to right now. All orgs, businesses and deals are fictional demo data.
"""

from datetime import datetime, timedelta

from app.core.auth import DEMO_USER_ID
from app.core.supabase import get_supabase
from app.events.dates import LA, iso, la_today, now_utc

B = {code: f"b0000000-0000-0000-0000-0000000000{n:02d}" for n, code in enumerate(
    ["GFS", "LVL", "DML", "THH", "SAL", "RTH", "OHE", "KAP", "TCC", "JFF", "WPH", "ZHS", "SGM", "ASC", "LRC", "VIL"], start=1)}


def eid(n: int) -> str:
    return f"e3000000-0000-0000-0000-{n:012d}"


def did(n: int) -> str:
    return f"f3000000-0000-0000-0000-{n:012d}"


ORGS = [
    ("c3000000-0000-0000-0000-000000000001", "Trojan Coders Collective", True),
    ("c3000000-0000-0000-0000-000000000002", "South Asian Cultural Club", True),
    ("c3000000-0000-0000-0000-000000000003", "First-Gen Trojans Network", True),
    ("c3000000-0000-0000-0000-000000000004", "Trojan Outdoors Club", True),
    ("c3000000-0000-0000-0000-000000000005", "Village Boba Society", False),
]
ORG = {name: oid for oid, name, _ in ORGS}

PROGRAMS = [
    {"id": "93000000-0000-0000-0000-000000000001", "name": "Career Event Series", "office": "Viterbi Career Connections",
     "reward_desc": "Demo program: attend 5 career events to unlock the office's perk. Check the official page for the real rules.",
     "required_count": 5, "rules_url": "https://viterbicareers.usc.edu/"},
    {"id": "93000000-0000-0000-0000-000000000002", "name": "Workshop Passport", "office": "USC Career Center",
     "reward_desc": "Demo program: 3 workshops earns a passport stamp. Check the official page for the real rules.",
     "required_count": 3, "rules_url": "https://careers.usc.edu/"},
]
P1, P2 = PROGRAMS[0]["id"], PROGRAMS[1]["id"]


def at(days: int, hour: int, minute: int = 0) -> datetime:
    """LA wall-clock time `days` from today."""
    d = la_today() + timedelta(days=days)
    return datetime(d.year, d.month, d.day, hour, minute, tzinfo=LA)


def today_slot(i: int, minutes_from_now: int, length_h: float = 2) -> tuple[datetime, datetime]:
    """A slot later today; if today is almost over, an event that's already running instead."""
    now = now_utc()
    start = now + timedelta(minutes=minutes_from_now)
    if start.astimezone(LA).date() != la_today() or start.astimezone(LA).hour >= 23:
        start = now - timedelta(minutes=20 * (i + 1))
    start = start.replace(second=0, microsecond=0, minute=(start.minute // 15) * 15)
    return start, start + timedelta(hours=length_h)


def events() -> list[dict]:
    now = now_utc().replace(second=0, microsecond=0)
    t = [today_slot(0, 45), today_slot(1, 150), today_slot(2, 240), today_slot(4, 360, 2.5)]
    running = (now - timedelta(minutes=20), now + timedelta(hours=1, minutes=40))  # check-in demo

    def ev(n, title, start, end, bcode, loc, category, org=None, freebie=None, free=True, desc=None, **extra):
        row = {
            "id": eid(n), "title": title, "description": desc, "starts_at": iso(start), "ends_at": iso(end),
            "building_id": B.get(bcode), "location_text": loc, "category": category,
            "is_free": free, "has_freebie": bool(freebie), "freebie_desc": freebie,
            "register_url": None, "ticket_url": None, "tickets_open_at": None,
            "org_id": ORG.get(org), "posted_by": DEMO_USER_ID,
            "source": "org" if org and dict((o[1], o[2]) for o in ORGS)[org] else "community",
            "flyer_url": None, "status": "published",
        }
        row.update(extra)
        return row

    return [
        # --- today: 5 freebies -------------------------------------------------
        ev(1, "Boba Study Break", *t[0], "VIL", "USC Village plaza", "free_food", "Village Boba Society", "Free boba",
           desc="Take a break from midterms. First 150 Trojans get a free drink."),
        ev(2, "Hack Night", *t[1], "SAL", "SAL 101", "academic", "Trojan Coders Collective", "Free pizza",
           desc="Bring a side project or start one. Mentors on hand all night."),
        ev(3, "First-Gen Mixer", *t[2], "TCC", "TCC 450", "social", "First-Gen Trojans Network", "Free tacos",
           desc="Meet other first-gen students, staff and alumni."),
        ev(4, "Resume Roast + Coffee", *running, "WPH", "Waite Phillips Hall lobby", "career", None, "Free coffee and donuts",
           desc="Get your resume reviewed live by recruiters and upperclassmen."),
        ev(5, "Outdoor Movie Night", *t[3], "VIL", "USC Village lawn", "social", None, "Free popcorn",
           desc="Blankets, a big screen and a crowd-pick movie."),
        # --- this week -----------------------------------------------------------
        ev(6, "Career Fair Prep Workshop", at(1, 12), at(1, 13), "RTH", "RTH 105", "career", None,
           desc="Elevator pitches, booth strategy and follow-up emails.", register_url="https://example.com/register/career-prep"),
        ev(7, "Diwali Night", at(6, 19), at(6, 23), "TCC", "TCC Grand Ballroom", "cultural", "South Asian Cultural Club",
           free=False, desc="Dinner, dance performances and a DJ. Tickets go fast!",
           ticket_url="https://example.com/tickets/diwali-night", tickets_open_at=iso(now + timedelta(minutes=30))),
        ev(8, "Intramural Soccer Pickup", at(1, 17), at(1, 19), "LRC", "Lyon Center fields", "sports", None,
           desc="All skill levels. Cleats optional, fun mandatory."),
        ev(9, "Free LinkedIn Headshots", at(2, 13), at(2, 16), "TCC", "TCC 2nd floor lounge", "career", None, "Free headshots",
           desc="Professional photographer, 5-minute slots, walk-ins welcome."),
        ev(10, "Lunar New Year Preview", at(4, 18), at(4, 20), "TCC", "TCC Ballroom", "cultural", None, "Free dumplings",
           desc="A taste of the spring festival: performances, crafts and food."),
        ev(11, "Midterm Study Jam", at(1, 19), at(1, 23), "LVL", "Leavey Library, 2nd floor", "academic", None, "Free snacks",
           desc="Quiet tables, tutors on call and a snack bar until 11 PM."),
        ev(12, "Engineering Alumni Panel", at(3, 18), at(3, 19, 30), "OHE", "OHE 122", "career", "Trojan Coders Collective",
           desc="Alumni from startups and big tech on their first year after USC.",
           register_url="https://example.com/register/alumni-panel"),
        ev(13, "Weekend Hike Info Session", at(2, 18), at(2, 19), "ZHS", "ZHS 159", "sports", "Trojan Outdoors Club",
           desc="Plan this month's Griffith Park sunrise hike."),
        ev(14, "Open Mic Night", at(3, 20), at(3, 22), "TCC", "TCC Ground Zero stage", "social", None, "Free hot chocolate",
           desc="Poetry, music, comedy. Sign up at the door."),
        ev(15, "Undergrad Research Poster Session", at(5, 14), at(5, 16), "DML", "Doheny Library, Rare Books Room", "academic", None,
           desc="See what undergrads have been building and discovering this semester."),
        ev(16, "Mock Interview Night", at(5, 18), at(5, 20), "JFF", "JFF 236", "career", None,
           desc="Practice behavioral and technical interviews with volunteers.",
           register_url="https://example.com/register/mock-interviews"),
        ev(17, "Salsa Social", at(4, 20), at(4, 22), "LRC", "Lyon Center studio", "social", None,
           desc="Beginner lesson at 8, open dancing after."),
        ev(18, "Film Screening + Discussion", at(6, 18), at(6, 20, 30), "ASC", "ASC 204", "cultural", None, "Free popcorn",
           desc="Indie documentary screening followed by a Q&A."),
        ev(19, "Volunteer Fair", at(2, 11), at(2, 14), "TCC", "TCC courtyard", "other", None, "Free t-shirts",
           desc="Meet 30+ LA nonprofits looking for student volunteers."),
        ev(20, "Basketball Watch Party", at(3, 19), at(3, 21), "VIL", "USC Village common room", "sports", None, "Free wings",
           desc="Big screen, loud crowd, cardinal and gold."),
        # --- past (the demo user attended these) -------------------------------------
        ev(21, "Tech Industry Talk", at(-7, 18), at(-7, 19), "SAL", "SAL 101", "career", None),
        ev(22, "Networking Night", at(-4, 18), at(-4, 20), "TCC", "TCC 450", "career", None),
        ev(23, "Internship Panel", at(-2, 17), at(-2, 18), "RTH", "RTH 115", "career", None),
    ]


PROGRAM_EVENTS = [(P1, eid(n)) for n in (21, 22, 23, 4, 6, 9, 12)] + [(P2, eid(n)) for n in (6, 9, 16)]
ATTENDED = [eid(21), eid(22), eid(23)]
SAVES = [(eid(1), False), (eid(2), True), (eid(7), False)]


def deals() -> list[dict]:
    now = now_utc().replace(second=0, microsecond=0)

    def deal(n, title, kind, how, votes, desc=None, starts=None, expires=None):
        return {"id": did(n), "title": title, "description": desc, "kind": kind, "how_to_claim": how,
                "link": f"https://example.com/deals/{n}", "starts_at": iso(starts), "expires_at": iso(expires),
                "posted_by": DEMO_USER_ID, "still_active_votes": votes}

    return [
        deal(1, "15% off any drink at Cardinal Café", "ongoing", "Show your USCard at the register", 12),
        deal(2, "Free bike safety check at Gold Line Cycles", "ongoing", "Walk in Mon–Fri, mention TrojanHub", 5),
        deal(3, "Half-price movie tickets on Tuesdays", "ongoing", "Student ID at the box office", 8,
             desc="Figueroa Cinema, all showtimes on Tuesdays."),
        deal(4, "Free premium plan for the Notely study app", "ongoing", "Sign up with your @usc.edu email", 3),
        deal(5, "Free cookies at the TCC info desk", "one_time", "Just stop by, while supplies last", 4,
             starts=now - timedelta(minutes=30), expires=now + timedelta(hours=3)),
        deal(6, "Free Trojan tote bags on the Doheny steps", "one_time", "Follow the club's page to grab one", 6,
             starts=now - timedelta(hours=1), expires=now + timedelta(hours=5)),
        deal(7, "BOGO burritos this weekend at Trojan Burrito", "one_time", "Show this post at checkout", 9,
             expires=now + timedelta(days=3)),
        deal(8, "Free succulent giveaway at the Village", "one_time", "First 100 students", 2,
             starts=now + timedelta(days=1), expires=now + timedelta(days=2)),
        deal(9, "Free pizza slice (last week)", "one_time", "Expired", 0,
             starts=now - timedelta(days=8), expires=now - timedelta(days=7)),
    ]


def ensure_demo_user(sb) -> None:
    """Tommy Trojan: the user the API falls back to before login exists (core/auth.py)."""
    try:
        sb.auth.admin.get_user_by_id(DEMO_USER_ID)
    except Exception:
        sb.auth.admin.create_user({
            "id": DEMO_USER_ID, "email": "demo.trojan@usc.edu", "email_confirm": True,
            "user_metadata": {"name": "Tommy Trojan"},
        })
    # usg_admin so the on-stage "Send digest now" button works once USE_MOCKS is off
    sb.table("profiles").upsert({
        "id": DEMO_USER_ID, "name": "Tommy Trojan", "role": "usg_admin", "interests": ["career", "free_food", "cultural"],
        "notify_email": True, "notify_push": True, "notify_categories": [],
    }).execute()


def run() -> None:
    sb = get_supabase()
    ensure_demo_user(sb)
    sb.table("orgs").upsert([{"id": oid, "name": name, "verified": v, "owner_id": DEMO_USER_ID if v else None}
                             for oid, name, v in ORGS]).execute()
    ev = events()
    sb.table("events").upsert(ev).execute()
    sb.table("deals").upsert(deals()).execute()
    sb.table("reward_programs").upsert(PROGRAMS).execute()
    sb.table("reward_program_events").upsert([{"program_id": p, "event_id": e} for p, e in PROGRAM_EVENTS]).execute()
    # reset the demo user's check-ins and saves, so rewards show 3/5 again and reminders re-fire
    sb.table("attendance").delete().eq("user_id", DEMO_USER_ID).execute()
    sb.table("attendance").insert([{"user_id": DEMO_USER_ID, "event_id": e} for e in ATTENDED]).execute()
    sb.table("event_saves").delete().eq("user_id", DEMO_USER_ID).execute()
    sb.table("event_saves").insert([{"user_id": DEMO_USER_ID, "event_id": e, "registered": r} for e, r in SAVES]).execute()
    sb.table("notification_log").delete().eq("user_id", DEMO_USER_ID).execute()
    from app.notify.digest import todays_items

    items = todays_items()
    print(f"Seeded {len(ORGS)} orgs, {len(ev)} events, {len(deals())} deals, {len(PROGRAMS)} reward programs, demo user.")
    print(f"Free today: {sum(i['kind'] == 'event' for i in items)} events + {sum(i['kind'] == 'deal' for i in items)} deals. "
          "Diwali Night tickets open in 30 min.")


if __name__ == "__main__":
    run()
