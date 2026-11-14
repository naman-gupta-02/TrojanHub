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

from app.chat import agent
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
    assert any("10:00 AM" in h for h in result["sources"][0]["contacts"]["hours"])
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
