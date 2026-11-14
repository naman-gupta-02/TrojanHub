"""P3 Parnavi: Events, Deals & Freebies (ARCHITECTURE.md §6, §7.3).

POST /flyers/scan          {image_url}
GET  /events/search        ?q=&from=&to=&category=&free=&freebie=
GET  /deals/search         ?q=&active=true
POST /events/{id}/save     {register?}
GET  /events/{id}/ics
GET  /rewards/progress
GET  /feed
"""

from fastapi import APIRouter

router = APIRouter(tags=["events & deals (P3)"])
