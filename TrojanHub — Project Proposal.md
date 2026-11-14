# TrojanHub — Project Proposal

AI@USC Hackathon · "For Trojans, By Trojans" · Nov 14, 2026 · @Naman

## Executive summary

TrojanHub is one AI campus companion that comes as a mobile app and a website. It brings lost & found, deals, events, maintenance complaints and campus questions into a single place.

At its center is an AI chatbot that answers USC questions with official links and contacts. It can also take actions: logging a complaint, reporting a found item, or turning a photo of a flyer into a calendar event. Around it sit four features: two-tier AI Lost & Found, Deals & Freebies, Org & Campus Events, and Smart Complaints. A dashboard for orgs and departments lets USC Student Government adopt it next semester.

**Tagline:** Everything Trojans need, one ask away.

**Platforms:** a mobile app (iOS and Android) and a responsive website. Both use the same backend and the same AI services.

## The problem

USC information is scattered across Engage SC, Instagram stories, posters on walls, department websites, group chats and word of mouth. So students miss things they would have used.

- **Missed events.** Many org events never reach Engage SC. One example: a Diwali event announced the day before, whose tickets ran out before most students heard about it.
- **Missed deals.** Student offers and free events, like a year of free Uber Eats or free boba outside the Village, spread by chance.
- **Lost items.** Everyone has lost a bottle, charger or AirPods on campus. Finders don't know where to take things, and owners don't know where to look.
- **Complaints go nowhere.** A dead door-lock battery, a broken fan or a broken desk often goes unreported. Students don't know which department handles what, and the same issue gets reported many times, or never.
- **Hard-to-find answers.** Simple questions like "when is the food pantry open?" or "who do I email about housing?" mean digging through many USC pages.

## Solution overview

TrojanHub replaces scattered sources with one AI hub. A student can ask a question, snap a photo, or browse a feed, and the system handles the rest.

| Who | What they do in TrojanHub | Platform |
| --- | --- | --- |
| Students | Ask the chatbot, report or find lost items, browse deals and events, log complaints | Mobile app (main), website |
| Student orgs (verified) | Post events, scan their own flyers, see RSVPs and interest | Website (main), app |
| Departments (Facilities, Housing, etc.) | See grouped complaints by building, export them to their existing request systems | Website dashboard |
| USG / admins | Verify orgs, moderate posts, see campus-wide trends | Website dashboard |

**Mobile app:** made for quick moments, like snapping a found item or a flyer, chatting on the go, and getting a reminder before a saved event.

**Website:** has every student feature, plus the org and department dashboards that are easier to use on a laptop.

## Features

### 1. Tommy, the AI chatbot (the heart of the app)

One chat box for anything about campus life. The chatbot answers from public USC pages and can take actions in the other features for you.

- **Answers with sources.** "Where is the USC food pantry and when is it open?" gets a short answer, the official link, and the right contact email or phone number.
- **Says when it doesn't know.** If no USC page answers the question, it says so and links the closest official page instead of guessing.
- **Takes actions.** Examples:
  - "It's so hot in GFS 213" → "Want me to log a complaint to Facilities?" → the complaint is filed with the building, room and issue already filled in.
  - "I found a blue umbrella at Leavey" → it starts a found-item report.
  - "Did anyone find a black Hydro Flask?" → it searches Lost & Found.
  - "Any free food today?" → it pulls from Deals and Events.
- **Scans flyers.** Upload or snap a flyer, and the AI reads the title, date, time, place, cost, link and organizer. It suggests a category, checks for duplicates, and adds it to Events or Deals after you confirm.

### 2. Lost & Found (two tiers)

When a finder uploads a photo, the AI decides which tier the item belongs to.

| Tier | Examples | What happens | Who checks ownership |
| --- | --- | --- | --- |
| Valuables | AirPods, phones, laptops, wallets, IDs, keys, cards | Item is listed with photo and where it was found. Finder is told to drop it at DPS or the nearest IT lost & found drop-off, with a map link. | DPS / IT at pickup |
| Everyday items | Bottles, umbrellas, jackets, chargers, notebooks | Item is listed with photo, description and location. Owner taps "This is mine" and arranges a handoff through in-app messages. | Not needed (low value) |

- **Search by words or by photo.** "Black Hydro Flask with a Trojans sticker" is matched against item photos using CLIP. Owners can also upload an old photo of their item.
- **Match alerts.** Owners can save a "lost" post. When a matching item is uploaded later, they get a notification.
- **Privacy.** No phone numbers or emails are shown. Handoffs happen through in-app chat, with suggested public meeting spots (Leavey, the Village, Doheny).
- **Auto-expiry.** Everyday items are archived after 14 days so the list stays fresh.

### 3. Deals & Freebies

One page for student offers and free stuff.

- Two kinds of posts: **ongoing deals** ("free Uber One for students for a year") and **one-time freebies** ("free boba outside the Village, 2–4 PM today").
- Each post shows how to claim it, when it expires, its source link, and a "still active?" upvote so expired deals drop off.
- Can be posted by students, orgs or businesses. Anyone can post by scanning a flyer.

**Attendance rewards.** Some offices give perks for attending a set number of events, for example programs run by the Viterbi Career Center or the USC Career Center. TrojanHub lists these programs in one place. Each one shows what you get, how many events you need, which events count, and a link to the official rules. Students can track their own progress ("3 of 5 events attended"), and the app suggests upcoming events that count.

**Add to calendar and register.** Every freebie event has two buttons:

- **Add to calendar:** saves it to the in-app calendar, or exports it to Google or Apple Calendar.
- **Register / RSVP:** opens the organizer's sign-up link, or registers directly in TrojanHub if the organizer posted it there. This works on both the app and the website.

**Freebie alerts.** Students who turn on notifications get:

- A **morning email and push digest** on days with freebie events ("Free today: boba outside the Village 2–4 PM, pizza at the SWE meeting 6 PM"). Nothing is sent on days with no freebies.
- A **reminder before each event** they saved or registered for (e.g. 30 minutes before).
- Settings to choose categories (food, merch, career perks) and to unsubscribe in one tap.

### 4. Org & Campus Events

A calendar for events that never make it to Engage SC.

- **Verified orgs** post events with a checkmark. Students can also submit events, which are marked "community posted."
- **Filters:** date, category (cultural, career, free food, sports, social, academic), free or paid, needs tickets, near me.
- **Ticket alerts.** Events with limited tickets show a "tickets open at" time and can notify interested students, so nobody misses something like the Diwali tickets again.
- **Save and sync.** RSVP, save to the in-app calendar, or export to Google or Apple Calendar.

### 5. Smart Complaints

Report a campus maintenance issue in one sentence.

- **AI routing.** The AI reads the report and picks a department (Facilities, Housing, IT, Transportation, DPS for safety) and a category (HVAC, electrical, furniture, locks, cleaning, Wi-Fi). It also sets an urgency level (low, medium, high, safety).
- **Grouping duplicates.** Reports about the same building, room and issue are merged into one ticket, like "5 students reported AC not working in GFS 213."
- **Sending it to the right place.** The ticket links to the department's existing request form or email, with the details filled in. TrojanHub does not claim to be an official channel.
- **Status tracking.** Students can follow "reported → sent → resolved" and upvote an issue instead of filing it again.
- **Safety first.** Anything about safety ("smell of gas", "someone is hurt") immediately shows DPS emergency contact information instead of a ticket.

### 6. Admin dashboard (web)

- **Departments:** a map or list of open complaints by building, duplicate counts, urgency, and CSV export.
- **Orgs:** their events, RSVPs, ticket-alert subscribers, and how many people saw each flyer.
- **USG admins:** org verification, moderation of reported posts, and campus-wide trends (most-reported buildings, most popular event categories).

### 7. Personalized feed

At signup, students choose their interests (free food, cultural, career, sports, etc.). The home screen then shows "3 things for you today", based on their interests, their saved events, and nearby deals.

## AI / ML design

The system has five AI parts. Each one is shown live in the demo.

| AI part | What it does | How we build it |
| --- | --- | --- |
| Answers from USC pages (RAG) | Answers campus questions with sources | Scrape public USC pages (pantry, housing, DPS, Facilities, IT, libraries, health) during the hackathon. Split them into chunks, embed them, and store them in a vector DB. Retrieve the top chunks and have the LLM answer only from them, citing URLs and contacts. |
| Agent that takes actions (tool calling) | Turns chat into actions | The LLM can call tools: `log_complaint`, `report_found_item`, `search_lost_items`, `search_events`, `search_deals`, `scan_flyer`. It always asks the user to confirm before writing anything. |
| Image matching (CLIP) | Lost & Found search and tier sorting | Make a CLIP image embedding for each found-item photo and a CLIP text embedding for each search, then rank by cosine similarity. Sort the item tier by zero-shot comparison to labels ("AirPods", "wallet", "water bottle", etc.). |
| Flyer reader | Turns a flyer photo into an event or deal | A vision LLM reads the image and returns JSON (title, date, time, location, cost, link, organizer, category). Missing fields are left for the user to fill in. |
| Complaint sorter and duplicate grouping | Routing and fewer duplicate tickets | The LLM returns JSON with department, category, urgency and location. A new report merges with an open ticket when the text is very similar and the building and room match. |

**Accuracy guardrails**

- The chatbot answers only from retrieved USC pages. If retrieval confidence is low, it answers "I couldn't find that" and gives the closest official link.
- Emails and phone numbers are copied from the source page, never generated.
- Every AI-filled form (flyer, complaint, found item) is shown to the user to edit before saving.
- A small test set of 20–30 real USC questions is used to check answer accuracy before the demo.

## Tech stack and architecture

We chose a stack where the app and the website share one TypeScript codebase, and one Python service handles the ML.

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile app | React Native + Expo | iOS and Android from one codebase; camera and push notifications built in |
| Website | Next.js + Tailwind (USC cardinal and gold theme) | Fast to build, responsive, hosts the admin dashboards |
| Backend / DB | Supabase (Postgres + pgvector + Auth + Storage + Realtime) | One service gives us the database, vector search, photo storage, login and live chat |
| Login | Magic link restricted to @usc.edu emails | Only Trojans can join; no passwords to build |
| AI API | FastAPI (Python) on Replit | Runs CLIP and the scraping and embedding pipeline; also qualifies us for Best Use of Replit |
| LLM | One hosted LLM with tool calling and vision (e.g. Claude or GPT-4o class) | Chat, tool calling, flyer reading, complaint sorting |
| Image model | OpenCLIP ViT-B/32 (open source) | Image and text embeddings for Lost & Found |
| Maps | Mapbox or Google Maps with USC building coordinates | Drop-off points, meeting spots, complaint map |
| Notifications | Expo push notifications + email | Lost-item matches, ticket alerts, event reminders |

### System architecture

&#91;embedded content: TrojanHub architecture · 2 clients, 1 backend, 1 AI service\]

The app and the website both talk to Supabase for data and to the AI service for anything smart. The AI service calls the LLM, CLIP and the USC index, and hands off to existing USC offices by link.

## Key user flows and 3-minute demo script

The demo follows one student, Naman, through three problems in one day. Each problem is one live moment.

| Time | Moment | What the judges see |
| --- | --- | --- |
| 0:00–0:25 | The hook | "Naman lost his Hydro Flask, missed the Diwali tickets, and his room is 85°F. Three problems, three different places to go. Not anymore." |
| 0:25–1:05 | Live moment 1: Lost & Found | A teammate snaps a photo of a real Hydro Flask → listed as an everyday item. Naman types "black Hydro Flask with a Trojans sticker" → it's the top match. Then snap AirPods → the AI says "Valuable: please drop at DPS" with a map. |
| 1:05–1:40 | Live moment 2: Flyer scan | Snap a real flyer → the title, date, place and cost fill in → the event appears on the calendar with a ticket alert. Show the Deals page and filters. |
| 1:40–2:20 | Live moment 3: Chat to complaint | Type "it's so hot in GFS 213" → Tommy offers to log it → complaint filed to Facilities, HVAC, medium urgency → it shows "4 others reported this." Then ask "when is the food pantry open?" → answer with official link and email. |
| 2:20–2:45 | Admin dashboard | Facilities view: complaints grouped by building. Org view: RSVPs. |
| 2:45–3:00 | The close | "Built for Trojans, by Trojans. USG could launch this next semester." |

**Backup plan:** record a full run of the demo on Saturday night. If Wi-Fi or an API fails during the pitch, play the recording.

## How we meet the judging criteria

| Criterion (weight) | What judges look for | How TrojanHub delivers |
| --- | --- | --- |
| Impact & Campus Relevance (30%) | A real friction point that could make campus life much better | Lost items, missed events and deals, and unrouted complaints affect nearly every student. One app replaces about five places students look today. |
| Technical & AI Execution (25%) | Build quality; effective, accurate, secure use of AI | Five real AI parts (RAG, tool calling, CLIP, vision reading, sorting). Answers cite sources, contacts are never invented, writes need confirmation, login is @usc.edu only. |
| Feasibility & Implementation (25%) | Real chance USG or departments adopt it next semester | Works alongside existing USC systems (DPS, Facilities forms) instead of replacing them. Dashboards for departments and orgs; low cost to run (see Feasibility). |
| User Experience & Design (20%) | Intuitive, accessible, appealing, suited to Trojans | Most actions take one step (chat, snap or tap), the design uses cardinal and gold, it works on mobile and web, and it targets WCAG AA contrast and screen-reader labels. |

Source: [AI@USC Hackathon rules](https://ai-usc.devpost.com/rules)

## Feasibility and adoption plan

TrojanHub can be run by USG and supports USC's existing offices rather than replacing them.

- **No integration needed on day one.** Complaints link to existing department forms and emails. Valuables still go to DPS, and the chatbot links to official pages. No USC system has to change.
- **Who could own it:** USG, as a student-run service, with the AI@USC committee or a student developer team maintaining it.
- **Low running cost.** Supabase and Replit have free or low-cost tiers. LLM costs stay small because answers are short and cached. A rough budget is in the hundreds of dollars per semester, not thousands (to be confirmed with real usage).
- **Keeping content up to date.** USC pages are scraped again every week. Verified orgs post their own events, and deals expire automatically.
- **Rollout:**
  1. Pilot with 5–10 student orgs and one residential building in the spring.
  2. Expand to all orgs and share the complaint data with Facilities and Housing.
  3. Explore official links with Engage SC and department request systems.
- **Success metrics:** weekly active students, items returned, events posted outside Engage SC, chatbot answers marked helpful, and the share of complaints grouped instead of filed twice.

## Privacy, safety and responsible AI

- **Only Trojans:** login requires an @usc.edu email.
- **No contact details shown:** Lost & Found handoffs happen through in-app chat, and the finder stays anonymous until both sides agree to meet.
- **Valuables go to DPS:** the app never handles proof of ownership for high-value items; DPS does.
- **Photo privacy:** photos are blurred when faces or ID cards are detected. Students are reminded not to upload photos that show personal information.
- **No made-up answers:** the chatbot answers only from USC sources and says when it doesn't know. Contacts come from source pages.
- **Confirm before acting:** the chatbot never files a complaint or posts an item without the user confirming.
- **Emergencies:** safety-related reports show DPS emergency information right away. TrojanHub is not an emergency service.
- **Moderation:** posts can be reported, spam is filtered by the AI, and verified orgs get more trust. USG admins have final say.
- **Data minimization:** we store only what each feature needs, and complaints can be submitted anonymously to departments.

## Build plan (Sat 12 PM → Sun 11 AM)

The plan assumes 4 teammates. Rename the roles to match your team.

**Roles**

| Role | Owns |
| --- | --- |
| A: AI / backend | RAG pipeline (scrape, embed, retrieve), LLM tool calling, complaint sorter |
| B: ML / Lost & Found | CLIP service on Replit, tier sorting, flyer reader |
| C: Mobile app | Expo app: chat, camera flows, Lost & Found, feed |
| D: Web + design + pitch | Next.js site, admin dashboard, branding, slides, video |

**Timeline**

| When | Milestone |
| --- | --- |
| Sat 12–2 PM | Set up Supabase tables, repos, Replit; agree on the API; scrape USC pages; design wireframes |
| Sat 2–7 PM | Core features: RAG chat working, CLIP search working, flyer JSON working, basic app and web screens |
| Sat 7–11 PM | Connect everything: chat tool calling, complaint flow end to end, events and deals pages, dashboard |
| Sat 11 PM–3 AM | Polish UI, add seed data (realistic events, items, complaints), test the 3 demo moments |
| Sun 3–7 AM | Sleep in shifts; fix bugs; record a backup demo video |
| Sun 7–9 AM | Final demo recording (≤ 3 min), slide deck, Devpost write-up, screenshots. Check-in by 9 AM. |
| Sun 9–10:30 AM | Submit on Devpost with a 30-minute buffer before the 11 AM deadline |

**Must have for the demo (MVP)**

- [ ] Chatbot answering from USC pages with links and contacts
- [ ] Chat → complaint logging with department routing
- [ ] Lost & Found photo upload, tier sorting, CLIP text search
- [ ] Flyer scan → event or deal created
- [ ] Events and deals list with basic filters
- [ ] One admin dashboard screen

**Nice to have (only if time allows)**

- [ ] Push notifications for matches and ticket alerts
- [ ] Duplicate complaint grouping shown live
- [ ] Personalized feed
- [ ] Map view for drop-offs and complaints
- [ ] Google or Apple Calendar export
- [ ] Daily freebie email digest + event reminders
- [ ] Attendance-rewards tracker (career center perks)

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Too many features for 23 hours | Build the MVP checklist first; everything else is a stretch goal. Features can share the same screens. |
| Chatbot makes up answers | Answer only from retrieved pages, say "I don't know" when unsure, and test on 20–30 real questions |
| CLIP misses matches on similar items | Combine image similarity with text and location matching; show the top 5, not just one |
| Wi-Fi or API fails during the pitch | Backup video recorded Saturday night; seed data stored locally |
| Scraping blocked or pages change | Scrape early on Saturday and store the text; we only need a few dozen key pages for the demo |
| Spam or fake posts | @usc.edu login, verified org badges, report button, AI spam filter |
| Misrouted complaints | The user confirms the department before sending; low-confidence ones go to a general Facilities queue |
| Judges ask "why not just Engage SC?" | Engage SC covers registered org events; we cover everything else (deals, flyers, lost items, complaints) and can link to Engage SC events |

## Future roadmap

- **Voice mode:** talk to Tommy while walking to class.
- **Official integrations:** Engage SC event import, Facilities and Housing ticket APIs, DPS lost & found database sync.
- **Location awareness:** "what's happening near me right now", using building check-ins.
- **More languages:** answers in Spanish, Mandarin, Hindi and Korean for international students.
- **Org recruiting tools:** AI-made event recaps, member interest matching, and flyer design help.
- **Other campuses:** the same platform could work for any university with its own pages and offices.

## Submission checklist (due Sun Nov 15, 11:00 AM PT)

- [ ] All teammates added on Devpost
- [ ] Project description: problem, solution, tech stack, challenges, future plans
- [ ] Working prototype link (deployed web app + GitHub repo; Expo link for the app)
- [ ] Demo video, 3 minutes max, showing the live prototype
- [ ] Slide deck (PDF or Google Slides)
- [ ] At least one screenshot or image
- [ ] All code and design made during Nov 14–15 (open-source libraries and public APIs are fine)
- [ ] Everyone checked in by 9:00 AM Sunday
- [ ] Finalist pitch practiced to under 3 minutes (3:00–4:30 PM Sunday)

## Sources

- [AI@USC Hackathon overview](https://ai-usc.devpost.com/)
- [AI@USC Hackathon rules](https://ai-usc.devpost.com/rules)
