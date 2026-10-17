#!/usr/bin/env python3
"""Render a Playwright JSON report as a Markdown table for the GitHub step summary.

Reads the report path from the PLAYWRIGHT_JSON_REPORT environment variable and appends the summary
to the file named by GITHUB_STEP_SUMMARY. Only a real parse failure exits non-zero: failing tests are
already decided by the Playwright step, so this script must never turn a green step red.

Standard library plus pydantic only. Pydantic validates the report shape, so an unexpected Playwright
report fails loudly here instead of producing a quietly wrong table.
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

DIAGNOSTIC_CATEGORIES = ("network", "status", "console", "pageerror", "websocket")
_CATEGORY_RE = re.compile(r"\[(network|status|console|pageerror|websocket)\]")
_MAX_FAILURES = 10
_MARKDOWN_SPECIALS = re.compile(r"([\\`*_{}\[\]()#+\-.!<>|])")


class Result(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str
    duration: float = 0.0
    retry: int = 0
    errors: list[dict] = Field(default_factory=list)


class TestCase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    projectName: str = "unknown"
    results: list[Result] = Field(default_factory=list)


class Spec(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    file: str = ""
    tests: list[TestCase] = Field(default_factory=list)


class Suite(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = ""
    file: str = ""
    specs: list[Spec] = Field(default_factory=list)
    suites: list["Suite"] = Field(default_factory=list)


class Stats(BaseModel):
    model_config = ConfigDict(extra="ignore")

    startTime: str = ""
    duration: float = 0.0
    expected: int = 0
    unexpected: int = 0
    flaky: int = 0
    skipped: int = 0


class Report(BaseModel):
    """The subset of the Playwright JSON report this script needs."""

    model_config = ConfigDict(extra="ignore")

    suites: list[Suite] = Field(default_factory=list)
    stats: Stats = Field(default_factory=Stats)


Suite.model_rebuild()


class BrowserCounts(BaseModel):
    browser: str
    passed: int = 0
    failed: int = 0
    flaky: int = 0
    skipped: int = 0
    duration_seconds: float = 0.0


class FailureRow(BaseModel):
    browser: str
    title: str
    category: str


class Summary(BaseModel):
    """Validates the rendered summary before it is written to the job summary."""

    browsers: list[BrowserCounts]
    failures: list[FailureRow]
    total_duration_seconds: float


def flatten(suites: list[Suite]) -> list[Spec]:
    out: list[Spec] = []
    for suite in suites:
        out.extend(suite.specs)
        out.extend(flatten(suite.suites))
    return out


def escape_markdown(text: str) -> str:
    """Escape Markdown control characters so a test title cannot break the table."""
    flat = " ".join(text.split())
    return _MARKDOWN_SPECIALS.sub(r"\\\1", flat)


def category_of(message: str) -> str:
    match = _CATEGORY_RE.search(message or "")
    return match.group(1) if match else "other"


def summarise(report: Report, max_failures: int = _MAX_FAILURES) -> Summary:
    browsers: dict[str, BrowserCounts] = {}
    failures: list[FailureRow] = []
    total_duration = 0.0

    for spec in flatten(report.suites):
        for case in spec.tests:
            counts = browsers.setdefault(case.projectName, BrowserCounts(browser=case.projectName))
            final = case.results[-1] if case.results else None
            if final is None:
                counts.skipped += 1
                continue
            duration = sum(r.duration for r in case.results)
            counts.duration_seconds += duration
            total_duration += duration
            retried = len([r for r in case.results if r.retry > 0]) or (final.retry > 0)
            if final.status == "passed":
                counts.passed += 1
                if retried and any(r.status != "passed" for r in case.results[:-1]):
                    counts.passed -= 1
                    counts.flaky += 1
            elif final.status == "skipped":
                counts.skipped += 1
            else:
                counts.failed += 1
                message = " ".join(str(e.get("message", "")) for e in final.errors)
                failures.append(
                    FailureRow(
                        browser=case.projectName,
                        title=spec.title,
                        category=category_of(message),
                    )
                )

    failures.sort(key=lambda f: (f.browser, f.title))
    return Summary(
        browsers=[browsers[k] for k in sorted(browsers)],
        failures=failures[:max_failures],
        total_duration_seconds=round(total_duration, 1),
    )


def render(summary: Summary, report: Report) -> str:
    lines: list[str] = ["## Playwright cross-browser results", ""]
    if not summary.browsers:
        lines.append("No tests were executed.")
        lines.append("")
        return "\n".join(lines)

    lines.append("| Browser | Passed | Failed | Flaky | Skipped | Duration |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for b in summary.browsers:
        lines.append(
            f"| {escape_markdown(b.browser)} | {b.passed} | {b.failed} | {b.flaky} | {b.skipped} | {b.duration_seconds:.1f}s |"
        )
    lines.append("")
    lines.append(f"Total measured run time: **{summary.total_duration_seconds:.1f}s**")
    lines.append("")

    if summary.failures:
        lines.append(f"### Failing tests ({len(summary.failures)} shown, category = failed diagnostic)")
        lines.append("")
        for f in summary.failures:
            lines.append(f"- `{escape_markdown(f.browser)}` **{f.category}**: {escape_markdown(f.title)}")
        lines.append("")
    else:
        lines.append("No failing tests.")
        lines.append("")
    return "\n".join(lines)


def load_report(path: str) -> Report:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError("report root must be a JSON object")
    return Report.model_validate(data)


def main(argv: list[str]) -> int:
    report_path = os.environ.get("PLAYWRIGHT_JSON_REPORT") or (argv[0] if argv else "")
    if not report_path:
        print("PLAYWRIGHT_JSON_REPORT is not set", file=sys.stderr)
        return 2
    try:
        report = load_report(report_path)
    except (OSError, ValueError, ValidationError, json.JSONDecodeError) as exc:
        print(f"could not parse the Playwright report: {exc}", file=sys.stderr)
        return 2

    markdown = render(summarise(report), report)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write(markdown)
            fh.write("\n")
    print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))