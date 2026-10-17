"""Unit tests for .github/scripts/summarize_playwright.py.

Run with: python -m pytest .github/scripts -q
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys

import pytest
from pydantic import ValidationError

MODULE_PATH = pathlib.Path(__file__).with_name("summarize_playwright.py")
spec = importlib.util.spec_from_file_location("summarize_playwright", MODULE_PATH)
assert spec and spec.loader
summarize = importlib.util.module_from_spec(spec)
sys.modules["summarize_playwright"] = summarize
spec.loader.exec_module(summarize)


def make_report(tmp_path: pathlib.Path, payload: dict) -> str:
    path = tmp_path / "results.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return str(path)


def spec_entry(title: str, project: str, results: list[dict]) -> dict:
    return {"title": title, "file": "tests/e2e/x.spec.ts", "tests": [{"projectName": project, "results": results}]}


def test_counts_per_browser_and_flaky(tmp_path: pathlib.Path) -> None:
    payload = {
        "suites": [
            {
                "title": "",
                "specs": [
                    spec_entry("passes", "firefox", [{"status": "passed", "duration": 2.0}]),
                    spec_entry("retried", "firefox", [
                        {"status": "failed", "duration": 1.0},
                        {"status": "passed", "duration": 1.5, "retry": 1},
                    ]),
                    spec_entry("fails", "webkit", [{"status": "failed", "duration": 3.0, "errors": [{"message": "[console] boom"}]}]),
                    spec_entry("skips", "webkit", [{"status": "skipped", "duration": 0.0}]),
                ],
                "suites": [],
            }
        ],
        "stats": {"duration": 6.5},
    }
    report = summarize.load_report(make_report(tmp_path, payload))
    summary = summarize.summarise(report)

    assert [(b.browser, b.passed, b.failed, b.flaky, b.skipped) for b in summary.browsers] == [
        ("firefox", 1, 0, 1, 0),
        ("webkit", 0, 1, 0, 1),
    ]
    assert summary.failures[0].category == "console"
    assert summary.total_duration_seconds == 7.5


def test_category_is_taken_from_the_diagnostics_fixture_message() -> None:
    assert summarize.category_of("[network] request to non-allowlisted origin: GET x") == "network"
    assert summarize.category_of("[pageerror] unhandled promise rejection") == "pageerror"
    assert summarize.category_of("locator.click: timeout") == "other"


def test_markdown_is_escaped_in_titles() -> None:
    payload = {
        "suites": [{"title": "", "specs": [spec_entry("pipe | star * and [link]", "firefox", [
            {"status": "failed", "duration": 1.0, "errors": [{"message": "[status] 404 /a.js"}]}
        ])], "suites": []}],
    }
    report = summarize.Report.model_validate(payload)
    markdown = summarize.render(summarize.summarise(report), report)
    assert "pipe \\| star \\* and \\[link\\]" in markdown
    assert "| 404" not in markdown


def test_render_contains_a_row_per_browser() -> None:
    payload = {"suites": [{"title": "", "specs": [spec_entry("ok", "webkit", [{"status": "passed", "duration": 1.0}])], "suites": []}]}
    report = summarize.Report.model_validate(payload)
    markdown = summarize.render(summarize.summarise(report), report)
    assert "| Browser | Passed | Failed | Flaky | Skipped | Duration |" in markdown
    assert "| webkit | 1 | 0 | 0 | 0 | 1.0s |" in markdown
    assert "No failing tests." in markdown


def test_sample_report_fixture_renders_a_full_table() -> None:
    fixture = pathlib.Path(__file__).parent / "fixtures" / "sample-report.json"
    report = summarize.load_report(str(fixture))
    summary = summarize.summarise(report)
    markdown = summarize.render(summary, report)

    assert [(b.browser, b.passed, b.failed, b.flaky) for b in summary.browsers] == [
        ("firefox", 1, 0, 1),
        ("webkit", 1, 1, 0),
    ]
    # Only the final result counts, so the retried firefox failure is flaky, not failed.
    assert [f.category for f in summary.failures] == ["other"]
    assert "| firefox | 1 | 0 | 1 | 0 | 15.7s |" in markdown
    assert summary.total_duration_seconds == 27.8
    assert "`webkit` **other**" in markdown


def test_invalid_report_shape_is_rejected(tmp_path: pathlib.Path) -> None:
    path = make_report(tmp_path, {"suites": [{"specs": "not-a-list"}]})
    with pytest.raises(ValidationError):
        summarize.load_report(path)


def test_main_writes_to_the_step_summary(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch, capsys) -> None:
    report_path = make_report(tmp_path, {"suites": [{"title": "", "specs": [spec_entry("ok", "firefox", [
        {"status": "passed", "duration": 1.0}
    ])], "suites": []}]})
    step_summary = tmp_path / "summary.md"
    monkeypatch.setenv("PLAYWRIGHT_JSON_REPORT", report_path)
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(step_summary))
    assert summarize.main([]) == 0
    assert "| firefox | 1 |" in step_summary.read_text(encoding="utf-8")


def test_main_returns_non_zero_only_on_parse_failure(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> None:
    broken = tmp_path / "broken.json"
    broken.write_text("{ not json", encoding="utf-8")
    monkeypatch.setenv("PLAYWRIGHT_JSON_REPORT", str(broken))
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)
    assert summarize.main([]) == 2

    failing = make_report(tmp_path, {"suites": [{"title": "", "specs": [spec_entry("nope", "webkit", [
        {"status": "failed", "duration": 1.0, "errors": [{"message": "boom"}]}
    ])], "suites": []}]})
    monkeypatch.setenv("PLAYWRIGHT_JSON_REPORT", failing)
    assert summarize.main([]) == 0