"""Tommy end-to-end tests with a scripted fake LLM (no API key needed).

Run from services/ai:  python -m pytest tests -q
Needs the local index (python -m scripts.scrape.chunk && python -m scripts.scrape.embed) for the
tests that hit real retrieval; those are skipped if it's missing.
"""

from __future__ import annotations

import json
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from app.chat import agent, store
from app.core.config import settings
from app.main import app
from app.rag.index import local_index

PANTRY = "https://studentbasicneeds.usc.edu/programs-and-services/food-support/trojan-food-pantry/"
needs_index = pytest.mark.skipif(local_index() is None, reason="local RAG index not built")


# ---------------------------------------------------------------------------
# Fake OpenAI-compatible client: each create() call plays the next scripted step
# ---------------------------------------------------------------------------
def text_step(text: str):
    return {"text": text}


def tool_step(name: str, **args):
    return {"tool": name, "args": args}


class FakeLLM:
    def __init__(self, steps, fail_stream=False, explode=False):
        self.steps = list(steps)
        self.calls: list[dict] = []
        self.fail_stream = fail_stream
        self.explode = explode
        self.chat = NS(completions=NS(create=self.create))

    async def create(self, stream=False, **kw):
        self.calls.append({"stream": stream, **kw})
        if self.explode:
            raise RuntimeError("LLM down")
        if stream and self.fail_stream:
            raise RuntimeError("proxy can't stream")
        step = self.steps.pop(0)
        if not stream:
            calls = [NS(id="call_1", function=NS(name=step["tool"], arguments=json.dumps(step["args"])))] if "tool" in step else None
            return NS(choices=[NS(message=NS(content=step.get("text"), tool_calls=calls))])

        async def gen():
            if "text" in step:
                for word in step["text"].split(" "):
                    yield NS(choices=[NS(delta=NS(content=word + " ", tool_calls=None))])
            else:
                args = json.dumps(step["args"])
                half = len(args) // 2  # arguments arrive in pieces, like real streaming
                yield NS(choices=[NS(delta=NS(content=None, tool_calls=[NS(index=0, id="call_1", function=NS(name=step["tool"], arguments=args[:half]))]))])
                yield NS(choices=[NS(delta=NS(content=None, tool_calls=[NS(index=0, id=None, function=NS(name=None, arguments=args[half:]))]))])

        return gen()


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    """Tests use the local RAG index, never the team's Supabase project, and start with no cache."""
    monkeypatch.setattr(settings, "supabase_url", "")
    store.cache_clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def llm(monkeypatch):
    def install(*steps, **kw):
        fake = FakeLLM(steps, **kw)
        monkeypatch.setattr(agent, "get_async_client", lambda: fake)
        monkeypatch.setattr(agent, "model_name", lambda vision=False: "fake-model")
        monkeypatch.setattr(settings, "llm_model", "fake-model")
        return fake

    return install


def chat(client, message, session="s1", **extra):
    with client.stream("POST", "/api/chat", json={"session_id": session, "message": message, **extra}) as r:
        assert r.status_code == 200
        return [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]


def answer_of(events):
    return "".join(e["text"] for e in events if e["type"] == "token")


# ---------------------------------------------------------------------------
@needs_index
def test_pantry_answer_cites_real_source(client, llm):
    fake = llm(tool_step("search_usc_info", query="Trojan Food Pantry hours"),
               text_step("It's open Tuesdays, Wednesdays, & Thursdays, 10:00 AM – 2:00 PM in King Hall [1]."))
    events = chat(client, "when is the food pantry open?")
    types = [e["type"] for e in events]
    assert types[0] == "tool_call" and types[1] == "tool_result" and types[-1] == "done"
    result = events[1]["result"]
    assert result["sources"][0]["url"] == PANTRY
    # the whole (small) pantry page comes back, so the hours are in one of its sections
    assert any("10:00 AM" in h for src in result["sources"] for h in src["contacts"]["hours"])
    sources = next(e for e in events if e["type"] == "sources")["sources"]
    assert [s["url"] for s in sources] == [PANTRY]  # only the cited one
    assert "couldn't verify" not in answer_of(events)
    # the LLM got the tool result back, then the system prompt rules
    assert fake.calls[1]["messages"][-1]["role"] == "tool"
    assert "NEVER write a contact detail" in fake.calls[0]["messages"][0]["content"]


@needs_index
def test_invented_phone_number_is_flagged(client, llm):
    llm(tool_step("search_usc_info", query="pantry phone"), text_step("Call them at 213-555-0199 [1]."))
    assert "couldn't verify a contact detail" in answer_of(chat(client, "pantry phone number?"))


@needs_index
def test_real_phone_number_is_not_flagged(client, llm):
    llm(tool_step("search_usc_info", query="DPS emergency number"), text_step("DPS emergency at UPC is 213-740-4321 [1]."))
    events = chat(client, "dps emergency number")
    assert "couldn't verify" not in answer_of(events)


def test_complaint_draft_confirm_flow(client, llm):
    llm(tool_step("log_complaint", text="it's so hot in GFS 213", building="GFS", room="213"),
        text_step("Sounds like the AC. Tap Confirm to send it to Facilities."))
    events = chat(client, "it's so hot in GFS 213", session="c1")
    card = next(e for e in events if e["type"] == "confirm")
    assert card["tool"] == "log_complaint"
    assert "Facilities" in card["summary"] and "4 others reported this" in card["summary"]

    r = client.post("/api/chat/confirm", json={"session_id": "c1", "action_id": card["action_id"], "approved": True})
    body = r.json()
    assert r.status_code == 200 and body["status"] == "done"
    assert body["message"].startswith("Logged! Sent to Facilities")
    # the card can't be used twice
    again = client.post("/api/chat/confirm", json={"session_id": "c1", "action_id": card["action_id"], "approved": True})
    assert again.status_code == 404


def test_confirm_wrong_session_is_rejected(client, llm):
    llm(tool_step("log_complaint", text="broken chair in SAL 101"), text_step("Confirm?"))
    card = next(e for e in chat(client, "broken chair in SAL 101", session="mine") if e["type"] == "confirm")
    r = client.post("/api/chat/confirm", json={"session_id": "someone-else", "action_id": card["action_id"], "approved": True})
    assert r.status_code == 404


def test_cancel_does_nothing(client, llm):
    llm(tool_step("log_complaint", text="leak in THH"), text_step("Confirm?"))
    card = next(e for e in chat(client, "leak in THH", session="x1") if e["type"] == "confirm")
    r = client.post("/api/chat/confirm", json={"session_id": "x1", "action_id": card["action_id"], "approved": False})
    assert r.json()["status"] == "cancelled"


def test_safety_never_creates_a_ticket(client, llm):
    llm(tool_step("log_complaint", text="I smell gas in the chem lab"), text_step("Please contact DPS now."))
    events = chat(client, "I smell gas in the chem lab")
    assert not any(e["type"] == "confirm" for e in events)
    result = next(e for e in events if e["type"] == "tool_result")["result"]
    assert "safety" in result


def test_found_item_posts_through_lost_and_found_endpoint(client, llm):
    llm(tool_step("report_found_item", description="blue umbrella", location="Leavey Library"),
        text_step("Tap Confirm to post it."))
    card = next(e for e in chat(client, "I found a blue umbrella at Leavey", session="f1") if e["type"] == "confirm")
    assert card["summary"] == "Found item · blue umbrella · Leavey Library"
    body = client.post("/api/chat/confirm", json={"session_id": "f1", "action_id": card["action_id"], "approved": True}).json()
    assert body["status"] == "done" and body["result"]["tier"] == "everyday"


def test_lost_item_search(client, llm):
    llm(tool_step("search_lost_items", query="black hydro flask"), text_step("Someone found one at Leavey."))
    result = next(e for e in chat(client, "anyone find a black hydro flask?") if e["type"] == "tool_result")["result"]
    assert result["results"][0]["title"].startswith("Black Hydro Flask")


def test_free_food_today(client, llm):
    llm(tool_step("search_events", query="free food", date_range="today", freebie_only=True), text_step("Free boba!"))
    result = next(e for e in chat(client, "any free food today?") if e["type"] == "tool_result")["result"]
    assert result["events"] and all(e["freebie"] for e in result["events"])
    assert result["events"][0]["when"].endswith("PT")


def test_non_streaming_fallback(client, llm):
    llm(text_step("Hi! I'm Tommy."), fail_stream=True)
    assert answer_of(chat(client, "hello")).strip() == "Hi! I'm Tommy."


def test_llm_down_still_finishes(client, llm):
    llm(explode=True)
    events = chat(client, "hello")
    assert agent.SORRY in answer_of(events) and events[-1]["type"] == "done"


def test_mock_stream_when_no_llm(client, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "")
    events = chat(client, "when is the food pantry open?")
    assert any(e["type"] == "sources" for e in events)  # served from chat_stream.json


def test_history_is_kept_per_session(client, llm):
    fake = llm(text_step("Nice to meet you."), text_step("You said hi."))
    chat(client, "hi, I'm Tommy's friend", session="h1")
    chat(client, "what did I say?", session="h1")
    second = fake.calls[1]["messages"]
    assert any(m["role"] == "user" and "Tommy's friend" in (m["content"] or "") for m in second)


def test_inline_photo_is_hidden_from_llm_and_posted(client, llm):
    import base64

    photo = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8fake-jpeg" * 500).decode()
    fake = llm(tool_step("report_found_item", description="water bottle", location="Leavey", image_url="photo://1"),
               text_step("Tap Confirm to post it."))
    events = chat(client, "found this at Leavey", session="p1", image_url=photo)
    user_msg = fake.calls[0]["messages"][-1]["content"]
    assert "photo://1" in user_msg and "base64" not in user_msg  # the LLM never sees the huge data URL
    card = next(e for e in events if e["type"] == "confirm")
    assert card["summary"].endswith("with photo")
    body = client.post("/api/chat/confirm", json={"session_id": "p1", "action_id": card["action_id"], "approved": True}).json()
    assert body["status"] == "done"


def test_flyer_photo_goes_to_flyer_scan(client, llm):
    llm(tool_step("scan_flyer", image_url="photo://1"), text_step("Here's what I read. Tap Confirm."))
    events = chat(client, "add this event", session="fl1", image_url="data:image/png;base64,iVBORw0KGgo=")
    card = next(e for e in events if e["type"] == "confirm")
    assert card["tool"] == "scan_flyer" and "Diwali" in card["summary"]


# ---------------------------------------------------------------------------
# Speed: pre-fetch and answer cache
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(("message", "expected"), [
    ("when is the food pantry open?", True),
    ("What's the DPS emergency number?", True),
    ("how do I report a phishing email", False),  # "report" may be an action: let the model decide
    ("any free food today?", False),
    ("did anyone find a black hydro flask?", False),
    ("it's so hot in GFS 213", False),
    ("I found a blue umbrella at Leavey", False),
    ("hello", False),
])
def test_should_prefetch(message, expected):
    assert agent.should_prefetch(message, has_photo=False) is expected
    assert agent.should_prefetch(message, has_photo=True) is False


@needs_index
def test_prefetch_answers_in_one_llm_call(client, llm):
    fake = llm(text_step("It's open Tuesdays, Wednesdays, & Thursdays, 10:00 AM – 2:00 PM [3]."))
    events = chat(client, "when is the food pantry open?")
    assert [e["type"] for e in events][:2] == ["tool_call", "tool_result"]  # searched before the LLM
    assert len(fake.calls) == 1
    assert fake.calls[0]["messages"][-1]["role"] == "tool"  # the LLM saw the sources right away
    assert any(e["type"] == "sources" for e in events)


@needs_index
def test_same_first_question_replays_from_cache(client, llm):
    llm(text_step("It's open Tuesdays, Wednesdays, & Thursdays, 10:00 AM – 2:00 PM [3]."))
    first = chat(client, "When is the food pantry open?", session="cache-a")
    down = llm(explode=True)  # the LLM is now unreachable
    second = chat(client, "when is the food pantry open", session="cache-b")
    assert len(down.calls) == 0
    assert answer_of(second) == answer_of(first)
    assert second[-1] == {"type": "done", "session_id": "cache-b"}
    assert any(e["type"] == "sources" for e in second)


def test_confirm_cards_are_never_cached(client, llm):
    llm(tool_step("log_complaint", text="it's so hot in GFS 213"), text_step("Tap Confirm."))
    a = next(e for e in chat(client, "it's so hot in GFS 213", session="n1") if e["type"] == "confirm")
    fake = llm(tool_step("log_complaint", text="it's so hot in GFS 213"), text_step("Tap Confirm."))
    events = chat(client, "it's so hot in GFS 213", session="n2")
    b = next(e for e in events if e["type"] == "confirm")
    assert a["action_id"] != b["action_id"]
    # one LLM call only: after a confirm card Tommy says a fixed line instead of asking the LLM again
    assert len(fake.calls) == 1 and answer_of(events) == agent.CONFIRM_LINE


def test_follow_up_questions_skip_the_cache(client, llm):
    llm(text_step("Hi!"))
    chat(client, "hello", session="f1")
    fake = llm(text_step("Hi again!"))
    assert answer_of(chat(client, "hello", session="f1")).strip() == "Hi again!"  # has history now
    assert len(fake.calls) == 1


def test_mock_flyer_photo_without_llm(client, monkeypatch):
    monkeypatch.setattr(settings, "llm_model", "")
    events = chat(client, "add this", session="mf", image_url="data:image/png;base64,iVBORw0KGgo=")
    card = next(e for e in events if e["type"] == "confirm")
    assert card["action_id"] == "act_mock_flyer" and card["tool"] == "scan_flyer"
    body = client.post("/api/chat/confirm", json={"session_id": "mf", "action_id": card["action_id"], "approved": True}).json()
    assert body["status"] == "done" and body["message"].startswith("Added!")


@pytest.mark.parametrize(("query", "kept"), [
    ("free food on campus today", None),
    ("any free food", None),
    ("free pizza tonight", "pizza"),
    ("career fair this week", "career fair"),
    (None, None),
])
def test_generic_words_are_not_used_as_keywords(query, kept):
    from app.chat.tools.events import specific_terms

    assert specific_terms(query) == kept


def test_free_food_on_campus_finds_the_freebies(client, llm):
    llm(tool_step("search_events", query="free food on campus", date_range="today", freebie_only=True),
        tool_step("search_deals", query="free food on campus today"), text_step("Free boba!"))
    results = [e["result"] for e in chat(client, "any free food on campus today?") if e["type"] == "tool_result"]
    assert results[0]["events"] and results[1]["deals"]


def test_chips_show_only_pages_the_answer_used():
    sources = [{"n": 1, "url": "https://a.usc.edu/"}, {"n": 2, "url": "https://b.usc.edu/x/"}, {"n": 3, "url": "https://c.usc.edu/"}]
    assert agent._cited("Open now [2].", sources) == [sources[1]]
    assert agent._cited("See [the page](https://c.usc.edu/) for details.", sources) == [sources[2]]
    assert agent._cited("I couldn't find that on USC's pages.", sources) == []  # no unrelated chips
    assert agent._cited("Both [1][1] and [2].", sources) == sources[:2]


# ---------------------------------------------------------------------------
# Follow-ups: the student answers Tommy's question with details
# ---------------------------------------------------------------------------
def test_prefetch_query_combines_question_and_details():
    history = [
        {"role": "user", "content": "does this course count towards my graduation?"},
        {"role": "assistant", "content": "Check your STARS report [1]. Which school are you in?"},
    ]
    q = agent.prefetch_queries("I'm an MS CS student in Viterbi", history, has_photo=False)
    assert q == ["does this course count towards my graduation? I'm an MS CS student in Viterbi"]
    assert agent.prefetch_queries("thanks!", [], has_photo=False) == []  # no question, no follow-up
    no_followup = [history[0], {"role": "assistant", "content": "Check your STARS report [1]."}]
    assert agent.prefetch_queries("I'm in Viterbi", no_followup, has_photo=False) == []


@needs_index
def test_follow_up_searches_again_with_both(client, llm):
    fake = llm(text_step("Check your STARS report [1]. Which school or major are you in?"),
               text_step("The CS M.S. Academic FAQs cover this; check your STARS report [2]."),
               text_step("Email the CS M.S. advisors at viterbiservicedesk.cscimasters@usc.edu [1]."))
    chat(client, "who do I contact to check if a course counts towards my degree?", session="fu1")
    events = chat(client, "I am a masters student in computer science in Viterbi", session="fu1")
    call = next(e for e in events if e["type"] == "tool_call")
    assert call["name"] == "search_usc_info"
    assert "counts towards my degree" in call["arguments"]["query"] and "computer science" in call["arguments"]["query"]
    urls = [s["url"] for s in next(e for e in events if e["type"] == "sources")["sources"]]
    assert any("cs.usc.edu/students/ms-students" in u for u in urls)  # the department's MS pages

    # a short question next ("what is the advisors email?") still knows it's about MS CS
    events = chat(client, "what is the advisors email?", session="fu1")
    queries = [e["arguments"]["query"] for e in events if e["type"] == "tool_call"]
    assert queries[0] == "what is the advisors email?" and "computer science" in queries[1]
    seen = " ".join(str(e["result"]) for e in events if e["type"] == "tool_result")
    assert "viterbiservicedesk.cscimasters@usc.edu" in seen  # the CS advisement page was found
    assert "couldn't verify" not in answer_of(events)
    # history keeps which pages earlier answers used
    first_answer = next(m for m in fake.calls[2]["messages"] if m["role"] == "assistant" and m["content"])
    assert "(Sources used: " in first_answer["content"] and "https://" in first_answer["content"]


def test_short_question_mid_chat_searches_alone_and_with_context():
    history = [{"role": "user", "content": "I am an MS CS student in Viterbi"}, {"role": "assistant", "content": "Got it."}]
    assert agent.prefetch_queries("what is the advisors email?", history, False) == [
        "what is the advisors email?", "what is the advisors email? I am an MS CS student in Viterbi"]
    long_q = "when is the Trojan Food Pantry open this week and where is it?"
    assert agent.prefetch_queries(long_q, history, False) == [long_q]
    assert agent.prefetch_queries("what is the advisors email?", [], False) == ["what is the advisors email?"]


@needs_index
def test_new_topic_mid_chat_still_finds_its_own_page(client, llm):
    llm(text_step("Check your STARS report [1]. Which school or major are you in?"),
        text_step("CS M.S. FAQs [2]."), text_step("Tuesdays to Thursdays, 10 AM to 2 PM [1]."))
    chat(client, "does a course count towards my graduation?", session="tc1")
    chat(client, "I'm an MS CS student in Viterbi", session="tc1")
    events = chat(client, "when is the pantry open?", session="tc1")
    first = next(e for e in events if e["type"] == "tool_result")["result"]["sources"]
    assert "trojan-food-pantry" in first[0]["url"]


@needs_index
def test_copied_sources_note_is_not_kept(client, llm):
    llm(text_step("Open Tue-Thu 10 AM-2 PM [1]. (Sources used: 1, 4)"))
    chat(client, "when is the food pantry open?", session="sn1")
    kept = [m for m in store.history("sn1") if m["role"] == "assistant"][0]["content"]
    assert kept.count("(Sources used: ") == 1  # only the app's own note, not the model's copy
    assert "1, 4)" not in kept
