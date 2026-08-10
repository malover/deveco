#!/usr/bin/env python3
"""Generate Mermaid sequence diagram from codetograph.json call graph."""

import json
import os
import sys
import argparse
from collections import defaultdict

def load_graph(path):
    with open(path) as f:
        return json.load(f)

def build_index(graph):
    nodes = {n["id"]: n for n in graph["nodes"]}
    calls = defaultdict(list)
    reversed_calls = defaultdict(list)
    for l in graph["links"]:
        if l.get("relation") == "calls":
            calls[l["source"]].append(l)
            reversed_calls[l["target"]].append(l)
    return nodes, calls, reversed_calls

def find_entity(nodes, query):
    """Find entity by label, ID, or file match (exact matches first)."""
    q = query.lower()
    exact = []
    partial = []
    for nid, n in nodes.items():
        label_lower = n.get("label", "").lower()
        id_lower = nid.lower()
        file_lower = n.get("source_file", "").lower()
        if label_lower == q or id_lower == q:
            exact.append(nid)
        elif q in label_lower or q in id_lower or q in file_lower:
            partial.append(nid)
    return exact + partial


# HarmonyOS UIAbility lifecycle callbacks — invoked by the framework on app start/stop.
_ABILITY_LIFECYCLE = {
    "onCreate", "onDestroy",
    "onWindowStageCreate", "onWindowStageDestroy",
    "onForeground", "onBackground",
    "onConfigurationUpdate", "onNewWant",
    "onContinue", "onRestore",
    "onMemoryLevel", "onPrepareToTerminate",
    "onWillNewWant", "onActive", "onInactive",
}

# HarmonyOS @Component / @Entry page lifecycle — called by the framework when a page appears.
_PAGE_LIFECYCLE = {
    "aboutToAppear", "aboutToDisappear",
    "onPageShow", "onPageHide",
    "onBackPress",
}

# HarmonyOS @Component build() — the root of every component's UI tree.
_UI_BUILD = {"build"}

# CLI / script entry points.
_CLI_ENTRY = {"main"}


def _classify_entry_point(label):
    """Classify a method label into ability/page/ui/cli tier, or None."""
    simple = label.rsplit(".", 1)[-1] if "." in label else label
    if simple in _ABILITY_LIFECYCLE or any(
        label.endswith(f".{p}") for p in _ABILITY_LIFECYCLE
    ):
        return "ability"
    if simple in _PAGE_LIFECYCLE or any(
        label.endswith(f".{p}") for p in _PAGE_LIFECYCLE
    ):
        return "page"
    if simple in _UI_BUILD or label.endswith(".build"):
        return "ui"
    if simple in _CLI_ENTRY:
        return "cli"
    return None


def find_entry_points(nodes, calls, reversed_calls):
    """Auto-detect entry points: methods not called by project code.

    Returns a sorted list of all entry-point candidate entity IDs, ordered by
    outgoing call count descending (most "interesting" first). The caller (LLM)
    should examine the candidates and decide which are the true application
    startup entry points based on domain knowledge.
    """
    called_internally: set[str] = set()
    for links in calls.values():
        for l in links:
            if l.get("confidence") != "EXTERNAL":
                called_internally.add(l["target"])

    entry_types = {"function", "method"}
    candidates = []
    for nid, n in nodes.items():
        if n.get("entity_type") not in entry_types:
            continue
        if nid in called_internally:
            continue
        out_deg = len(calls.get(nid, []))
        candidates.append((nid, out_deg))

    candidates.sort(key=lambda x: x[1], reverse=True)
    return [nid for nid, _ in candidates]

def fmt_participant(entry):
    return entry.rsplit("/", 1)[-1].replace(".ets", "").replace(".ts", "").replace(".", "_")

def trace(entity_id, calls, nodes, visited=None, depth=0, max_depth=5):
    if visited is None:
        visited = set()
    if entity_id in visited or depth > max_depth:
        return []
    visited.add(entity_id)

    results = []
    for l in calls.get(entity_id, []):
        target = nodes.get(l["target"], {"label": l["target"], "source_file": ""})
        ctx = l.get("context", "")
        ctx_tags = []
        if "(self)" in ctx:
            ctx_tags.append("self")
        for kw in ["[if]", "[else]", "[loop]", "[switch]", "[try]", "[catch]"]:
            if kw in ctx:
                ctx_tags.append(kw.strip("[]"))

        results.append({
            "caller": nodes.get(entity_id, {}),
            "callee": target,
            "line": l.get("source_location", "?"),
            "context": ctx_tags,
            "confidence": l.get("confidence", "?"),
        })
        results.extend(trace(l["target"], calls, nodes, visited, depth + 1, max_depth))
    return results

def generate_diagram(entries, calls, nodes, max_depth=3, max_steps=30):
    all_steps = []
    for eid in entries:
        all_steps.extend(trace(eid, calls, nodes, max_depth=max_depth))

    # Deduplicate while preserving order
    seen = set()
    steps = []
    for s in all_steps:
        key = (s["caller"].get("label"), s["callee"].get("label"), tuple(s["context"]))
        if key not in seen:
            seen.add(key)
            steps.append(s)
            if len(steps) >= max_steps:
                break

    # Collect participants
    participants = {}
    for s in steps:
        for node in (s["caller"], s["callee"]):
            if node.get("label"):
                pid = fmt_participant(node.get("id", ""))
                participants[pid] = node.get("label", pid)

    lines = ["```mermaid", "sequenceDiagram"]
    for pid, label in participants.items():
        lines.append(f"    participant {pid} as {label}")
    lines.append("")

    for s in steps:
        cpart = fmt_participant(s["caller"].get("id", ""))
        tpart = fmt_participant(s["callee"].get("id", ""))
        ctx = f"[{','.join(s['context'])}]" if s["context"] else ""
        lines.append(f"    {cpart}->>{tpart}: {s['callee'].get('label', '?')}() @L{s['line']} {ctx}")

    lines.append("```")
    return lines, steps

def get_output_path(entity_id, source_file, out_dir):
    if source_file:
        rel_dir = os.path.splitext(source_file)[0]
    else:
        rel_dir = "unknown"
    method_name = entity_id.rsplit("_", 1)[-1] if "_" in entity_id else entity_id
    rel_path = os.path.join(rel_dir, f"{method_name}.mmd")
    full_path = os.path.join(out_dir, rel_path)
    return full_path, rel_path


def update_index(out_dir, entity_id, rel_path):
    index_path = os.path.join(out_dir, "INDEX.json")
    index = {}
    if os.path.exists(index_path):
        with open(index_path) as f:
            index = json.load(f)
    index[entity_id] = rel_path
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)


def write_diagram(lines, full_path):
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w") as f:
        f.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="Generate Mermaid sequence diagram from codetograph.json")
    parser.add_argument("--graph", required=True, help="Path to codetograph.json")
    parser.add_argument("--entry", default=None, help="Entity name or file-substring to trace from. If omitted, auto-detect entry points.")
    parser.add_argument("--depth", type=int, default=3, help="Max call depth (default: 3)")
    parser.add_argument("--steps", type=int, default=30, help="Max steps in diagram (default: 30)")
    parser.add_argument("--list", action="store_true", help="List matching (or auto-detected) entities without generating diagram")
    parser.add_argument("--out-dir", default="", help="Output directory for diagrams (default: <graph-dir>/diagrams)")
    parser.add_argument("--stdout", action="store_true", help="Print diagram to stdout instead of saving to file")
    parser.add_argument("--max-entries", type=int, default=0, help="Max number of entry points to generate (0 = all)")
    parser.add_argument("--tier", default="all", choices=["ability", "page", "ui", "cli", "all"],
                        help="Entry point tier filter (default: all — let LLM pick the right startup methods)")
    args = parser.parse_args()

    graph = load_graph(args.graph)
    nodes, calls, reversed_calls = build_index(graph)

    if args.entry:
        entry_ids = find_entity(nodes, args.entry)
        if not entry_ids:
            print(f"No entity found matching '{args.entry}'", file=sys.stderr)
            sys.exit(1)
        entry_source = f"manual query '{args.entry}'"
    else:
        all_entries = find_entry_points(nodes, calls, reversed_calls)
        if not all_entries:
            print("No entry points auto-detected.", file=sys.stderr)
            sys.exit(1)

        if args.tier != "all":
            entry_ids = [eid for eid in all_entries
                         if _classify_entry_point(nodes[eid].get("label", "")) == args.tier]
        else:
            entry_ids = all_entries

        if not entry_ids:
            print(f"No entry points found for tier '{args.tier}'. Try --tier all.", file=sys.stderr)
            sys.exit(1)

        entry_source = f"auto-detection (tier={args.tier})"

    if args.max_entries > 0 and len(entry_ids) > args.max_entries:
        print(f"Limiting to {args.max_entries} of {len(entry_ids)} entry points", file=sys.stderr)
        entry_ids = entry_ids[:args.max_entries]

    if args.list:
        if args.tier == "all":
            from collections import Counter
            tier_counts = Counter()
            for eid in entry_ids:
                t = _classify_entry_point(nodes[eid].get("label", "")) or "other"
                tier_counts[t] += 1
            summary = ", ".join(f"{t}={c}" for t, c in tier_counts.most_common())
            print(f"--- {len(entry_ids)} entry points ({entry_source}) — tiers: {summary} ---")
        else:
            print(f"--- {len(entry_ids)} entry points ({entry_source}) ---")
        print()

        num = 0
        for eid in entry_ids:
            num += 1
            n = nodes[eid]
            call_count = len(calls.get(eid, []))
            called_by = len(reversed_calls.get(eid, []))
            tier = _classify_entry_point(n.get("label", "")) or "other"
            label = n.get("label", "")
            parent = label.rsplit(".", 1)[0] if "." in label else ""
            print(f"  #{num} [{tier}] {n['id']}")
            print(f"    Label:  {label}")
            print(f"    Type:   {n.get('entity_type','?')}")
            print(f"    File:   {n['source_file']}")
            if parent and parent != label:
                print(f"    Parent: {parent}")
            print(f"    Calls:  {call_count} out, {called_by} in")
            print()
        sys.exit(0)

    if len(entry_ids) > 1 and not args.entry:
        print(f"{entry_source}: found {len(entry_ids)} entry points. Generating diagrams for all...", file=sys.stderr)

    if len(entry_ids) > 1 and args.entry:
        print(f"Found {len(entry_ids)} matches for '{args.entry}'. Using the first one. Use --list to see all.", file=sys.stderr)
        entry_ids = [entry_ids[0]]

    out_dir = args.out_dir or os.path.join(os.path.dirname(args.graph), "diagrams")
    total_steps = 0
    for entry_id in entry_ids:
        diag_lines, steps = generate_diagram([entry_id], calls, nodes, args.depth, args.steps)
        total_steps += len(steps)

        if args.stdout:
            print(f"\n--- Diagram for: {nodes[entry_id].get('label', entry_id)} ---")
            print("\n".join(diag_lines))
        else:
            source_file = nodes[entry_id].get("source_file", "")
            full_path, rel_path = get_output_path(entry_id, source_file, out_dir)
            write_diagram(diag_lines, full_path)
            update_index(out_dir, entry_id, rel_path)
            print(f"Saved diagram to {full_path}", file=sys.stderr)

    print(f"\n<!-- {total_steps} total steps, {len(entry_ids)} entry entities ({entry_source}) -->", file=sys.stderr)

if __name__ == "__main__":
    main()
