"""Ways to earn around USC: perks for showing up, small tasks, applications and competitions.

Hand-checked against each office's official page (`url`) on CHECKED_ON. Only facts those
pages state are written here; anything a page leaves out (exact prizes, point values) is
left out too, and students are sent to the official page for the current rules.

`tracked_program_id` links a perk to a reward_programs row, so TrojanHub check-ins count
toward it on the Rewards page. `style` says how that progress reads:
  goal    -> "2 of 3 events" toward a reward
  entries -> every check-in is one more entry in a drawing
"""

CHECKED_ON = "2026-11-14"

CAREER_FEST_PROGRAM = "93000000-0000-0000-0000-000000000001"
CPF_PROGRAM = "93000000-0000-0000-0000-000000000002"

# How progress reads for each tracked program (default: goal)
PROGRAM_STYLE = {CAREER_FEST_PROGRAM: "entries", CPF_PROGRAM: "goal"}

PERKS: list[dict] = [
    # --- Show up -----------------------------------------------------------------
    {
        "id": "career-fest-drawing",
        "name": "Career Fest prize drawing",
        "office": "USC Career Center",
        "way": "attend",
        "redeemable": True,
        "reward": "Prizes in a drawing with four winners",
        "how_to_earn": "Check in at each Career Fest event, virtual or in person. Every event is one more entry.",
        "who": "USC students",
        "when": "Career Fest week each January (last ran Jan 26–30, 2026)",
        "deadline": None,
        "url": "https://careers.usc.edu/career-fest-2026/",
        "tracked_program_id": CAREER_FEST_PROGRAM,
    },
    {
        "id": "cpf-student-scholars",
        "name": "CPF Student Scholars Program",
        "office": "Center for the Political Future (USC Dornsife)",
        "way": "attend",
        "redeemable": True,
        "reward": "Three tiers: a private jobs page and priority enrollment; then a graduation honor cord and a private "
                  "reception; then the Elizabeth Garrett Leadership Award scholarship",
        "how_to_earn": "Sign up once with the Student Scholars form, then send proof after each CPF event (a selfie or a "
                       "Zoom screenshot). Study groups, conferences, speaker events, classes and internships count.",
        "who": "Any USC student, any school or major, undergrad or grad",
        "when": "All year",
        "deadline": None,
        "url": "https://dornsife.usc.edu/center-for-political-future/jesse-m-unruh-institute-of-politics/cpf-student-scholars-program/",
        "tracked_program_id": CPF_PROGRAM,
    },
    {
        "id": "career-carnival",
        "name": "Career Carnival",
        "office": "USC Career Center",
        "way": "attend",
        "redeemable": True,
        "reward": "Carnival games, prizes and food",
        "how_to_earn": "Register on Handshake. First-years complete their Handshake profile; 2nd–4th years complete the "
                       "Summer Experience Survey.",
        "who": "Undergraduates",
        "when": "Each fall in Alumni Park (last held Sept 22, 2026)",
        "deadline": None,
        "url": "https://careers.usc.edu/career-carnival/",
        "tracked_program_id": None,
    },
    {
        "id": "legion-pass",
        "name": "The Legion Pass (USC Student Rewards app)",
        "office": "Third-party app for USC students (row27 / FanMaker)",
        "way": "attend",
        "redeemable": True,
        "reward": "Points you spend in the app's prize store",
        "how_to_earn": "Check in to events in the app, and connect social accounts for extra points.",
        "who": "USC students",
        "when": "Ongoing",
        "deadline": None,
        "url": "https://apps.apple.com/us/app/id1276337470",
        "tracked_program_id": None,
    },
    # --- Compete -----------------------------------------------------------------
    {
        "id": "residential-college-cup",
        "name": "Residential College Cup",
        "office": "Residential Education",
        "way": "compete",
        "redeemable": False,
        "reward": "The Residential College Cup trophy for your college, plus giveaways at events",
        "how_to_earn": "Your residential college earns points when you attend Cup events, place in them, or score in competitions.",
        "who": "First-year students (seven residential college teams)",
        "when": "All year; the trophy is awarded at the end of the academic year",
        "deadline": None,
        "url": "https://resed.usc.edu/events/residential-college-cup/",
        "tracked_program_id": None,
    },
    {
        "id": "workout-challenge",
        "name": "USC Workout Challenge",
        "office": "Recreational Sports",
        "way": "compete",
        "redeemable": True,
        "reward": "The top 10 point earners enter a draw for USC & Nike gear or a semester-long USC Workout Pass",
        "how_to_earn": "Earn points by attending USC Workout classes, bringing a friend, and going to Rec Sports events.",
        "who": "USC Workout Pass holders (students, faculty and staff)",
        "when": "Each fall (last ran Sept–Oct 2026)",
        "deadline": None,
        "url": "https://engage.usc.edu/web/rsvp_boot?id=412481",
        "tracked_program_id": None,
    },
    # --- Small tasks -----------------------------------------------------------------
    {
        "id": "wellbeing-survey",
        "name": "Student Well-being Index Survey",
        "office": "USC Well-being Collective",
        "way": "task",
        "redeemable": True,
        "reward": "A drawing for 800 Amazon e-gift cards of $25",
        "how_to_earn": "Complete the survey and give your USC email address.",
        "who": "USC students",
        "when": "When the survey is open (check the page)",
        "deadline": None,
        "url": "https://uscwellbeingcollective.usc.edu/?p=2262",
        "tracked_program_id": None,
    },
    {
        "id": "paid-research-studies",
        "name": "Paid research studies",
        "office": "Marshall Behavioral Research Lab (and other USC labs)",
        "way": "task",
        "redeemable": True,
        "reward": "Cash or gift cards for taking part in a study",
        "how_to_earn": "Sign up for open studies on the lab's SONA page. Other labs post studies in school newsletters.",
        "who": "Depends on the study",
        "when": "Ongoing",
        "deadline": None,
        "url": "https://www.marshall.usc.edu/faculty-research/labs-and-institutes/marshall-behavioral-research-lab/participants/studies-cash-payment",
        "tracked_program_id": None,
    },
    # --- Apply -------------------------------------------------------------------
    {
        "id": "impact-scholarship",
        "name": "USC Career Center Impact Scholarship",
        "office": "USC Career Center",
        "way": "apply",
        "redeemable": True,
        "reward": "$2,500 for an unpaid summer internship (at least 6 weeks)",
        "how_to_earn": "Apply on Scholarship Universe, then upload your documents on Handshake (Job ID #11174222).",
        "who": "Continuing undergraduates graduating Dec 2027–May 2030 with financial need, a first career-focused "
               "internship, or a nonprofit/government internship",
        "when": "Applications open Oct 12, 2026",
        "deadline": "2027-04-17T06:59:00Z",  # Fri April 16, 2027, 11:59 PM Pacific
        "url": "https://careers.usc.edu/resources/summer-internship-scholarships/",
        "tracked_program_id": None,
    },
    {
        "id": "libraries-research-award",
        "name": "USC Libraries Research Award",
        "office": "USC Libraries",
        "way": "apply",
        "redeemable": True,
        "reward": "Up to $300 for undergraduates, up to $500 for graduate students",
        "how_to_earn": "Submit a paper or project you completed at USC in a for-credit class or independent study this academic year.",
        "who": "Undergraduate and graduate students",
        "when": "Each academic year (see the page for this year's deadline)",
        "deadline": None,
        "url": "https://libguides.usc.edu/researchaward",
        "tracked_program_id": None,
    },
    {
        "id": "jep-service-awards",
        "name": "JEP Community Service Awards",
        "office": "Joint Educational Project (USC Dornsife)",
        "way": "apply",
        "redeemable": True,
        "reward": "Awards for students with sustained community service, such as the $1,000 Barbara Seaver Gardner Award",
        "how_to_earn": "Serve with JEP across several semesters near campus; graduating seniors and grad students are recognized each year.",
        "who": "Graduating seniors and graduate students (varies by award)",
        "when": "Each spring",
        "deadline": None,
        "url": "https://dornsife.usc.edu/joint-educational-project/2023-community-service-awards/",
        "tracked_program_id": None,
    },
    {
        "id": "dream-dollars",
        "name": "Dream Dollars",
        "office": "USC Career Center",
        "way": "apply",
        "redeemable": True,
        "reward": "Funding for an unpaid summer internship (amount not published)",
        "how_to_earn": "Secure an unpaid summer internship with a government agency or nonprofit, then apply.",
        "who": "Undergraduates",
        "when": "Before each summer",
        "deadline": None,
        "url": "https://diversity.usc.edu/category/news",
        "tracked_program_id": None,
    },
    # --- TrojanHub itself --------------------------------------------------------
    {
        "id": "trojanhub-freebies",
        "name": "Free food and swag at events",
        "office": "TrojanHub",
        "way": "attend",
        "redeemable": True,
        "reward": "Free food, drinks and merch, listed every day",
        "how_to_earn": "Turn on the morning freebie email, or check Free today on the home page.",
        "who": "Everyone",
        "when": "Every day",
        "deadline": None,
        "url": "/events?freebie=true",
        "tracked_program_id": None,
    },
]


def perks() -> dict:
    return {"perks": PERKS, "checked_on": CHECKED_ON}


def style(program_id: str) -> str:
    return PROGRAM_STYLE.get(program_id, "goal")
