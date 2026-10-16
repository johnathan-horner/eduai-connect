"""Smoke tests: the demo app renders every page, the API answers /health, and the MCP server imports."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
DEMO_APP = ROOT / "streamlit_app" / "streamlit_app.py"
PAGES = [
    "📊 Class Dashboard",
    "⚠️ At-Risk Students",
    "👤 Student Profiles",
    "💬 AI Chat",
    "⚙️ System Info",
]


@pytest.mark.parametrize("page", PAGES)
def test_demo_page_renders(page):
    from streamlit.testing.v1 import AppTest

    at = AppTest.from_file(str(DEMO_APP), default_timeout=90).run()
    assert not at.exception
    at.sidebar.radio[0].set_value(page).run()
    assert not at.exception, at.exception


@pytest.mark.parametrize("name", ["students", "courses", "assignments", "submissions"])
def test_synthetic_data_loads(name):
    records = json.loads((ROOT / "data" / f"{name}.json").read_text())
    assert len(records) > 0


def test_api_health(monkeypatch):
    pytest.importorskip("fastapi")
    pytest.importorskip("faiss")
    from fastapi.testclient import TestClient

    # The API loads faiss_index/ with a relative path, so run from the repo root.
    monkeypatch.chdir(ROOT)
    monkeypatch.syspath_prepend(str(ROOT))
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    from src.api.main import app

    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_mcp_server_imports(monkeypatch):
    pytest.importorskip("fastmcp")
    monkeypatch.syspath_prepend(str(ROOT))
    sys.modules.pop("mcp_server", None)
    import mcp_server

    assert mcp_server.mcp is not None
