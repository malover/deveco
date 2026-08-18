#!/usr/bin/env python3
"""Mechanical validation for ProjectSpec v6 Markdown output."""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path

START = "<!-- PROJECTSPEC:GENERATED:START -->"
END = "<!-- PROJECTSPEC:GENERATED:END -->"
LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
TITLE_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
PLACEHOLDER_RE = re.compile(
    r"<(?:revision|relative|workspace|project|module|system|subsystem)[^>]*>|"
    r"\{\{[^}]+\}\}|\bTODO\b",
    re.I,
)


def validate_file(path: Path, docs_root: Path) -> tuple[list[str], str | None]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    rel = path.relative_to(docs_root)

    if text.count(START) != text.count(END):
        errors.append(f"{rel}: unmatched ProjectSpec generated markers")
    if text.count(START) > 1 or text.count(END) > 1:
        errors.append(f"{rel}: expected at most one generated region")
    if START in text and END in text and text.index(START) > text.index(END):
        errors.append(f"{rel}: generated markers are reversed")

    if text.count("```") % 2:
        errors.append(f"{rel}: unbalanced fenced code block")

    match = PLACEHOLDER_RE.search(text)
    if match:
        errors.append(f"{rel}: unresolved placeholder {match.group(0)!r}")

    for raw_target in LINK_RE.findall(text):
        target = raw_target.strip().split("#", 1)[0].strip()
        if not target or target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        target = target.split(" ", 1)[0].strip("<>")
        resolved = (path.parent / target).resolve()
        try:
            resolved.relative_to(docs_root.resolve())
        except ValueError:
            continue
        if not resolved.exists():
            errors.append(f"{rel}: broken local link -> {raw_target}")

    title = TITLE_RE.search(text)
    if not title:
        errors.append(f"{rel}: missing H1 title")
        return errors, None
    return errors, title.group(1).strip()


def validate_tree(docs_root: Path) -> list[str]:
    errors: list[str] = []
    if not docs_root.is_dir():
        return [f"not a directory: {docs_root}"]

    for required in ("index.md", "high-level-business.md", "high-level-architecture.md"):
        if not (docs_root / required).is_file():
            errors.append(f"missing required document: {required}")

    titles: list[tuple[str, Path]] = []
    files = sorted(docs_root.rglob("*.md"))
    if not files:
        errors.append("no Markdown documents found")
        return errors

    for path in files:
        file_errors, title = validate_file(path, docs_root)
        errors.extend(file_errors)
        if title:
            titles.append((title.casefold(), path))

    counts = Counter(title for title, _ in titles)
    for normalized, count in counts.items():
        if count > 1:
            paths = ", ".join(
                str(path.relative_to(docs_root))
                for title, path in titles
                if title == normalized
            )
            errors.append(f"duplicate H1 title {normalized!r}: {paths}")
    return errors


def self_test() -> int:
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        common = f"{START}\n# {{title}}\n\n> Scope: `.`\n\n{END}\n"
        (root / "index.md").write_text(
            common.format(title="Index")
            + "\n[Architecture](high-level-architecture.md)\n",
            encoding="utf-8",
        )
        (root / "high-level-business.md").write_text(
            common.format(title="Business"), encoding="utf-8"
        )
        (root / "high-level-architecture.md").write_text(
            common.format(title="Architecture"), encoding="utf-8"
        )
        if validate_tree(root):
            print("self-test failed: valid fixture rejected", file=sys.stderr)
            return 1
        (root / "index.md").write_text(
            "# Index\n[Missing](missing.md)\n", encoding="utf-8"
        )
        if not any("broken local link" in error for error in validate_tree(root)):
            print("self-test failed: broken link not detected", file=sys.stderr)
            return 1
    print("ProjectSpec validator self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("docs_root", nargs="?", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if args.docs_root is None:
        parser.error("docs_root is required unless --self-test is used")
    errors = validate_tree(args.docs_root.resolve())
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"ProjectSpec validation passed: {args.docs_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
