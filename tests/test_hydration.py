from __future__ import annotations

import json

import pytest

from mcp_names.bootstrap import compose_service, default_fixture_path
from mcp_names.config import Config
from mcp_names.mcp.server import create_mcp_server
from mcp_names.service import NamesService


@pytest.fixture(scope="module")
def fixture_db(tmp_path_factory):
    """Prefer the shipped fixture; build one in temp if missing."""
    shipped = default_fixture_path()
    if shipped.exists():
        return shipped
    from scripts.build_fixture_db import sample_records
    from namelex import build as build_module

    out = tmp_path_factory.mktemp("db") / "surnames.sqlite3"
    entries = build_module.merge(sample_records())
    return build_module.build(out, entries)


@pytest.fixture
def service(fixture_db):
    svc = NamesService(Config(db_path=fixture_db))
    yield svc
    svc.close()


def test_hydrate_resolves_misspelling(service: NamesService):
    result = service.hydrate_name("Schmit")
    names = [m["name"] for m in result["matches"]]
    assert "Schmidt" in names
    assert result["query"] == "Schmit"
    assert "probability" in result
    assert result["needsHuman"] is False or any(
        m.get("confident") for m in result["matches"]
    )


def test_hydrate_exact_mueller(service: NamesService):
    result = service.hydrate_name("Müller")
    assert result["probability"]["known"] is True
    assert result["needsHuman"] is False
    # Transcriptions stored as variants from GND.
    assert set(result["variants"]) & {"Mueller", "Muller"}


def test_hydrate_empty_name(service: NamesService):
    result = service.hydrate_name("  ")
    assert result["needsHuman"] is True
    assert "error" in result


def test_hydrate_noise_needs_human(service: NamesService):
    result = service.hydrate_name("Xqzptwvqq")
    assert result["probability"]["known"] is False
    # No confident lexicon hit expected for keyboard noise.
    assert result["needsHuman"] is True


def test_lexicon_stats(service: NamesService):
    stats = service.lexicon_stats()
    assert stats["surnames"] >= 5
    assert stats["exists"] is True


def test_mcp_tools_registered(service: NamesService):
    server = create_mcp_server(service)
    # FastMCP keeps tools in a manager; names must include hydrate_name.
    tool_names = set(server._tool_manager._tools.keys())  # noqa: SLF001
    assert "hydrate_name" in tool_names
    assert "lexicon_stats" in tool_names


def test_compose_service_missing_db(tmp_path):
    missing = tmp_path / "nope.sqlite3"
    with pytest.raises(FileNotFoundError):
        compose_service(Config(db_path=missing))


def test_hydrate_json_serializable(service: NamesService):
    payload = service.hydrate_name("Schneider")
    json.dumps(payload)  # must not raise
