import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict, deque
from typing import Any


class CodeGraph:
    """In-memory index over a codetograph.json knowledge graph."""

    def __init__(self, path: str, diagrams_dir: str = ""):
        self.path = path
        self.diagrams_dir = diagrams_dir or os.path.join(os.path.dirname(path), "diagrams")
        self.data: dict[str, Any] = {}
        self.nodes: dict[str, dict[str, Any]] = {}
        self._adj: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        self._rev_adj: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        self._calls_by_source: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        self._meta: dict[str, Any] = {}
        self._stat = {"mtime": 0.0, "size": 0}
        if os.path.isfile(self.path):
            self._load()

    def _load(self):
        st = os.stat(self.path)
        self._stat = {"mtime": st.st_mtime, "size": st.st_size}
        with open(self.path) as fh:
            self.data = json.load(fh)

        self.nodes = {n["id"]: n for n in self.data.get("nodes", [])}
        self._meta = self.data.get("graph", {})

        self._adj.clear()
        self._rev_adj.clear()
        self._calls_by_source.clear()
        for link in self.data.get("links", []):
            self._adj[link["source"]].append(link)
            self._rev_adj[link["target"]].append(link)
            if link.get("relation") == "calls":
                self._calls_by_source[link["source"]].append(link)

    def _maybe_reload(self):
        try:
            st = os.stat(self.path)
            if st.st_mtime != self._stat["mtime"] or st.st_size != self._stat["size"]:
                self._load()
        except OSError:
            pass

    @property
    def available(self) -> bool:
        return self._stat["size"] > 0

    @property
    def stats(self) -> dict[str, Any]:
        return dict(self._meta)

    @staticmethod
    def _levenshtein(a: str, b: str) -> int:
        """Compute Levenshtein edit distance between two strings."""
        if len(a) < len(b):
            a, b = b, a
        if len(b) == 0:
            return len(a)
        prev = list(range(len(b) + 1))
        for i, ca in enumerate(a):
            curr = [i + 1]
            for j, cb in enumerate(b):
                insert = prev[j + 1] + 1
                delete = curr[j] + 1
                substitute = prev[j] + (0 if ca == cb else 1)
                curr.append(min(insert, delete, substitute))
            prev = curr
        return prev[-1]

    def _tokenize_query(self, query: str) -> tuple[list[str], bool]:
        """Split query into words. Returns (tokens, is_and).

        'OR' splits into union terms (default, is_and=False).
        'AND' or '&' sets intersection mode (is_and=True).
        """
        is_and = False
        tokens: list[str] = []
        # Check for explicit AND/OR keywords
        has_or = re.search(r'\bOR\b', query, re.IGNORECASE)
        has_and = re.search(r'\bAND\b', query, re.IGNORECASE)
        if has_and and not has_or:
            is_and = True
            query = re.sub(r'\bAND\b', ' ', query, flags=re.IGNORECASE)
        elif has_or:
            query = re.sub(r'\bOR\b', ' ', query, flags=re.IGNORECASE)

        for word in re.split(r'[\s,;:|&/+]+', query):
            word = word.strip('._-()[]{}!?\'"')
            if word and len(word) >= 2:
                tokens.append(word.lower())
        return tokens, is_and

    def _fuzzy_match_token(self, token: str, target: str) -> bool:
        """Check if token fuzzy-matches any part of target using edit distance.

        Uses sliding windows of len(token) +/- max_dist to handle missing/extra chars.
        Skips targets with low character overlap for performance.
        """
        max_dist = 1 if len(token) <= 6 else 2

        # Quick length filter: skip if lengths are too different
        tlen = len(target)
        klen = len(token)
        if tlen < max(3, klen - max_dist * 2) or tlen > klen + 8:
            return False

        # Quick character overlap filter with stricter threshold
        token_set = set(token)
        # Count overlapping chars between token and target
        overlap = sum(1 for c in token_set if c in target)
        min_overlap = max(2, klen - max_dist - 1)
        if overlap < min_overlap:
            return False

        window_sizes = range(max(3, klen - max_dist), min(tlen, klen + max_dist) + 1)
        for wsize in window_sizes:
            for i in range(tlen - wsize + 1):
                if self._levenshtein(token, target[i:i + wsize]) <= max_dist:
                    return True
        return False

    def find(self, query: str) -> list[str]:
        """Search nodes by label, id, or source_file. Delegates to find_scored()."""
        return [nid for _, nid in self.find_scored(query)]

    def find_scored(self, query: str) -> list[tuple[int, str]]:
        """Search nodes by label, id, or source_file with word-level fuzzy matching.

        Returns list of (score, node_id) sorted by score descending.

        Supports:
        - Multi-word queries (word-level OR by default, AND with explicit AND keyword)
        - Levenshtein fuzzy fallback for typo-tolerant matching
        - Scoring: exact label/id > substring in label > substring in id > in file path > fuzzy
        """
        q = query.lower().strip()
        if not q:
            return []

        tokens, is_and = self._tokenize_query(query)

        # If only one token, preserve old behavior (exact first) with fuzzy fallback
        if len(tokens) == 1:
            exact: list[tuple[int, str]] = []
            partial: list[tuple[int, str]] = []
            fuzzy: list[tuple[int, str]] = []
            token = tokens[0]
            for nid, node in self.nodes.items():
                label = (node.get("label") or "").lower()
                fid = nid.lower()
                fpath = (node.get("source_file") or "").lower()
                if label == token or fid == token:
                    exact.append((20, nid))
                elif token in label or token in fid or token in fpath:
                    partial.append((10, nid))
                elif len(token) >= 4:
                    if self._fuzzy_match_token(token, label):
                        fuzzy.append((3, nid))
                    elif self._fuzzy_match_token(token, fid):
                        fuzzy.append((2, nid))
            return exact + partial + fuzzy

        # Multi-word: score each node by how many words match
        scored: list[tuple[int, str]] = []
        for nid, node in self.nodes.items():
            label = (node.get("label") or "").lower()
            fid = nid.lower()
            fpath = (node.get("source_file") or "").lower()
            total = 0
            matched = 0

            for token in tokens:
                ts = 0
                # Exact match on whole label or id
                if label == token or fid == token:
                    ts = 20
                # Token is a word within the label (camelCase/snake_case aware)
                elif token in label or token in fid:
                    ts = 10
                # Token in file path (lowest signal)
                elif token in fpath:
                    ts = 5
                # Levenshtein fuzzy fallback for typo tolerance
                else:
                    if self._fuzzy_match_token(token, label):
                        ts = 3
                    elif self._fuzzy_match_token(token, fid):
                        ts = 2

                if ts > 0:
                    matched += 1
                    total += ts

            if is_and and matched < len(tokens):
                continue  # AND mode: must match ALL tokens

            if total > 0:
                scored.append((total, nid))

        scored.sort(key=lambda x: x[0], reverse=True)
        return scored

    def neighbors(self, node_id: str, relation: str = "", confidence: str = "") -> dict[str, Any]:
        node = self.nodes.get(node_id)
        if not node:
            return {"error": f"Node '{node_id}' not found"}

        outgoing = []
        incoming = []
        for link in self._adj.get(node_id, []):
            if relation and link.get("relation") != relation:
                continue
            if confidence and link.get("confidence") != confidence:
                continue
            target = self.nodes.get(link["target"], {})
            outgoing.append({
                "target_id": link["target"],
                "target_label": target.get("label", link["target"]),
                "target_file": target.get("source_file", ""),
                "relation": link.get("relation"),
                "confidence": link.get("confidence"),
                "context": link.get("context", ""),
                "location": link.get("source_location", ""),
            })
        for link in self._rev_adj.get(node_id, []):
            if relation and link.get("relation") != relation:
                continue
            if confidence and link.get("confidence") != confidence:
                continue
            source = self.nodes.get(link["source"], {})
            incoming.append({
                "source_id": link["source"],
                "source_label": source.get("label", link["source"]),
                "source_file": source.get("source_file", ""),
                "relation": link.get("relation"),
                "confidence": link.get("confidence"),
                "context": link.get("context", ""),
                "location": link.get("source_location", ""),
            })
        return {
            "node": self._node_summary(node),
            "outgoing": outgoing,
            "incoming": incoming,
        }

    def trace_calls(self, node_id: str, max_depth: int = 3, max_steps: int = 40) -> dict[str, Any]:
        node = self.nodes.get(node_id)
        if not node:
            return {"error": f"Node '{node_id}' not found"}

        steps: list[dict[str, Any]] = []
        visited: set[str] = set()

        def _trace(eid: str, depth: int):
            if depth > max_depth or eid in visited:
                return
            visited.add(eid)
            for link in self._calls_by_source.get(eid, []):
                target = self.nodes.get(link["target"], {})
                ctx = link.get("context", "")
                ctx_tags = []
                if "(self)" in ctx:
                    ctx_tags.append("self")
                for kw in ("[if]", "[else]", "[loop]", "[switch]", "[try]", "[catch]"):
                    if kw in ctx:
                        ctx_tags.append(kw.strip("[]"))

                caller_node = self.nodes.get(eid, {})
                steps.append({
                    "caller_id": eid,
                    "caller_label": caller_node.get("label", eid),
                    "callee_id": link["target"],
                    "callee_label": target.get("label", link["target"]),
                    "callee_file": target.get("source_file", ""),
                    "relation": "calls",
                    "confidence": link.get("confidence", "?"),
                    "context_tags": ctx_tags,
                    "location": link.get("source_location", ""),
                })
                if len(steps) >= max_steps:
                    return
                _trace(link["target"], depth + 1)

        _trace(node_id, 0)

        # Generate Mermaid syntax
        participants: dict[str, str] = {}
        for s in steps:
            for item in (
                (s["caller_id"], s["caller_label"]),
                (s["callee_id"], s["callee_label"]),
            ):
                pid, label = item
                short = pid.rsplit("_", 1)[-1] if "_" in pid else pid
                participants[short] = label

        mermaid_lines = ["sequenceDiagram"]
        for pid, label in participants.items():
            mermaid_lines.append(f"    participant {pid} as {label}")
        mermaid_lines.append("")

        for s in steps:
            cp = s["caller_id"].rsplit("_", 1)[-1] if "_" in s["caller_id"] else s["caller_id"]
            tp = s["callee_id"].rsplit("_", 1)[-1] if "_" in s["callee_id"] else s["callee_id"]
            ctx = f"[{','.join(s['context_tags'])}]" if s["context_tags"] else ""
            mermaid_lines.append(
                f"    {cp}->>{tp}: {s['callee_label']}() @{s['location']} {ctx}"
            )

        return {
            "entry": self._node_summary(node),
            "depth": max_depth,
            "total_steps": len(steps),
            "steps": steps,
            "mermaid": "\n".join(mermaid_lines),
        }

    def find_path(self, from_id: str, to_id: str, max_hops: int = 6) -> dict[str, Any]:
        if from_id not in self.nodes:
            return {"error": f"Source node '{from_id}' not found"}
        if to_id not in self.nodes:
            return {"error": f"Target node '{to_id}' not found"}

        undirected: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        for nid in self.nodes:
            for link in self._adj.get(nid, []):
                undirected[nid].append(link)
            for link in self._rev_adj.get(nid, []):
                undirected[nid].append(link)

        queue: deque[tuple[str, list[dict[str, Any]]]] = deque([(from_id, [])])
        visited: set[str] = {from_id}

        while queue:
            current, path = queue.popleft()
            if len(path) >= max_hops:
                continue
            for link in undirected.get(current, []):
                if link["source"] == current:
                    nxt = link["target"]
                    direction = "forward"
                else:
                    nxt = link["source"]
                    direction = "reverse"

                step_from = link["source"]
                step_to = link["target"]
                step = {
                    "from": step_from,
                    "to": step_to,
                    "from_label": self.nodes.get(step_from, {}).get("label", step_from),
                    "to_label": self.nodes.get(step_to, {}).get("label", step_to),
                    "relation": link.get("relation"),
                    "confidence": link.get("confidence"),
                    "context": link.get("context", ""),
                    "direction": direction,
                }
                new_path = path + [step]
                if nxt == to_id:
                    return {
                        "from": self._node_summary(self.nodes[from_id]),
                        "to": self._node_summary(self.nodes[to_id]),
                        "hops": len(new_path),
                        "path": new_path,
                    }
                if nxt not in visited:
                    visited.add(nxt)
                    queue.append((nxt, new_path))

        return {"error": f"No path found between '{from_id}' and '{to_id}' within {max_hops} hops"}

    def god_nodes(self, top_n: int = 10, exclude_external: bool = True) -> list[dict[str, Any]]:
        scored: list[tuple[int, str]] = []
        for nid in self.nodes:
            if exclude_external and (nid.startswith("@external/") or nid.startswith("@config/")):
                continue
            degree = len(self._adj.get(nid, [])) + len(self._rev_adj.get(nid, []))
            scored.append((degree, nid))
        scored.sort(key=lambda x: x[0], reverse=True)

        results: list[dict[str, Any]] = []
        for degree, nid in scored[:top_n]:
            node = self.nodes[nid]
            out_deg = len(self._adj.get(nid, []))
            in_deg = len(self._rev_adj.get(nid, []))
            rels: dict[str, int] = defaultdict(int)
            for link in self._adj.get(nid, []):
                rels[link.get("relation", "?")] += 1
            results.append({
                "id": nid,
                "label": node.get("label"),
                "type": node.get("entity_type"),
                "file": node.get("source_file"),
                "degree": degree,
                "outgoing": out_deg,
                "incoming": in_deg,
                "relations": dict(rels),
                "details": node.get("details"),
            })
        return results

    def to_html(self, output_path: str, node_limit: int = 5000) -> str:
        """Generate an interactive vis-network HTML visualization."""
        entity_colors = {
            "class": "#e74c3c", "struct": "#e74c3c",
            "method": "#3498db", "function": "#2ecc71",
            "file": "#9b59b6", "interface": "#1abc9c",
            "enum": "#f39c12", "variable": "#95a5a6",
            "external": "#7f8c8d", "config": "#e67e22",
        }
        default_color = "#34495e"

        degree: Counter[str] = Counter()
        for link in self.data.get("links", []):
            degree[link["source"]] += 1
            degree[link["target"]] += 1

        max_deg = max(degree.values(), default=1) or 1

        if len(self.nodes) > node_limit:
            comm_map: dict[str, str] = {}
            for nid, node in self.nodes.items():
                sf = node.get("source_file", "")
                mod = sf.split("/")[0] if "/" in sf else sf or "unknown"
                comm_map[nid] = mod
            meta_comm: dict[str, dict[str, Any]] = {}
            for nid, mod in comm_map.items():
                if mod not in meta_comm:
                    meta_comm[mod] = {"count": 0, "node": nid}
                meta_comm[mod]["count"] += 1
            edge_counts: Counter[tuple[str, str]] = Counter()
            for link in self.data.get("links", []):
                sm = comm_map.get(link["source"])
                tm = comm_map.get(link["target"])
                if sm and tm and sm != tm:
                    a, b = (sm, tm) if sm < tm else (tm, sm)
                    edge_counts[(a, b)] += 1

            vis_nodes = []
            for mod, info in meta_comm.items():
                vis_nodes.append({
                    "id": mod, "label": mod,
                    "color": {"background": entity_colors.get("class", default_color),
                              "border": entity_colors.get("class", default_color),
                              "highlight": {"background": "#fff", "border": entity_colors.get("class", default_color)}},
                    "size": 10 + 30 * (info["count"] / max(meta_comm[m]["count"] for m in meta_comm)),
                    "font": {"size": 14, "color": "#fff"},
                    "title": f"{mod} ({info['count']} entities)",
                    "community": 0, "community_name": mod,
                    "source_file": "", "file_type": "community",
                    "degree": info["count"],
                })
            vis_edges = []
            for (a, b), w in edge_counts.items():
                vis_edges.append({
                    "from": a, "to": b, "label": f"{w} edges",
                    "title": f"{w} cross-module edges", "dashes": False,
                    "width": max(1, min(5, w // 10)), "color": {"opacity": 0.6},
                    "confidence": "AGGREGATED",
                })
        else:
            vis_nodes = []
            community_by_dir: dict[str, int] = {}
            for nid, node in self.nodes.items():
                sf = node.get("source_file", "")
                mod = sf.split("/")[0] if "/" in sf else sf or "unknown"
                if mod not in community_by_dir:
                    community_by_dir[mod] = len(community_by_dir)
                cid = community_by_dir[mod]
                etype = node.get("entity_type", "")
                color = entity_colors.get(etype, default_color)
                d = degree.get(nid, 1)
                size = 8 + 20 * (d / max_deg)
                vis_nodes.append({
                    "id": nid, "label": node.get("label", nid),
                    "color": {"background": color, "border": color,
                              "highlight": {"background": "#fff", "border": color}},
                    "size": round(size, 1),
                    "font": {"size": 10 if d >= max_deg * 0.15 else 0, "color": "#fff"},
                    "title": f"{node.get('label', nid)} ({etype}) [{node.get('source_file', '')}]",
                    "community": cid, "community_name": mod,
                    "source_file": node.get("source_file", ""),
                    "file_type": etype, "degree": d,
                    "details": node.get("details"),
                })
            vis_edges = []
            for link in self.data.get("links", []):
                conf = link.get("confidence", "EXTRACTED")
                vis_edges.append({
                    "from": link["source"], "to": link["target"],
                    "label": link.get("relation", ""),
                    "title": f"{link.get('relation', '')} [{conf}]",
                    "dashes": conf != "EXTRACTED",
                    "width": 2 if conf == "EXTRACTED" else 1,
                    "color": {"opacity": 0.7 if conf == "EXTRACTED" else 0.3},
                    "confidence": conf,
                })

        legend_data = []
        seen_etypes = set()
        for n in vis_nodes:
            ft = n.get("file_type", "")
            if ft and ft not in seen_etypes:
                seen_etypes.add(ft)
                legend_data.append({"label": ft, "color": entity_colors.get(ft, default_color)})

        def _js_safe(obj):
            return json.dumps(obj).replace("</", "<\\/")

        html = self._HTML_TEMPLATE.format(
            nodes_json=_js_safe(vis_nodes),
            edges_json=_js_safe(vis_edges),
            legend_json=_js_safe(legend_data),
            title=_js_safe(f"Code Graph - {os.path.basename(self.path)}"),
            entity_count=len(self.nodes),
            link_count=len(self.data.get("links", [])),
        )

        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
        with open(output_path, "w") as f:
            f.write(html)
        return output_path

    def query_graph(
        self,
        question: str,
        mode: str = "bfs",
        depth: int = 3,
        max_nodes: int = 50,
        context_filter: str = "",
    ) -> dict[str, Any]:
        """NLP query: IDF-weighted seed selection + BFS/DFS traversal + heuristic context filters."""
        tokens = self._query_terms(question)
        if not tokens:
            return {"error": "No searchable terms in question", "question": question}

        idf = self._compute_idf(tokens)
        scores = self._score_nodes(tokens, idf)
        seeds = self._pick_seeds(scores)

        if not seeds:
            return {
                "question": question,
                "tokens": tokens,
                "inferred_filter": self._infer_filter(question),
                "effective_filter": "",
                "mode": mode,
                "seeds": [],
                "total_nodes": 0,
                "total_edges": 0,
                "nodes": [],
                "edges": [],
                "message": "No matching entities found",
            }

        inferred_filter = self._infer_filter(question)
        effective_filter = context_filter or inferred_filter

        local_degree: Counter[str] = Counter()
        for link in self.data.get("links", []):
            local_degree[link["source"]] += 1
            local_degree[link["target"]] += 1

        subgraph_nodes: set[str] = set()
        subgraph_edges: list[dict[str, Any]] = []

        if mode == "bfs":
            visited: set[str] = set()
            hub_degree = self._hub_threshold()
            for seed_id, _score in seeds:
                if len(subgraph_nodes) >= max_nodes:
                    break
                frontier = [seed_id]
                for _hop in range(depth):
                    next_frontier: list[str] = []
                    for current in frontier:
                        for link in self._adj.get(current, []):
                            if effective_filter and link.get("relation") != effective_filter:
                                continue
                            nxt = link["target"]
                            subgraph_nodes.add(current)
                            subgraph_nodes.add(nxt)
                            subgraph_edges.append({
                                "source_id": link["source"], "target_id": link["target"],
                                "source_label": self.nodes.get(link["source"], {}).get("label", link["source"]),
                                "target_label": self.nodes.get(nxt, {}).get("label", nxt),
                                "relation": link.get("relation"), "confidence": link.get("confidence"),
                                "context": link.get("context", ""), "direction": "forward",
                            })
                            if nxt not in visited:
                                visited.add(nxt)
                                if local_degree[nxt] < hub_degree or nxt == seed_id:
                                    next_frontier.append(nxt)
                            if len(subgraph_nodes) >= max_nodes:
                                break
                        for link in self._rev_adj.get(current, []):
                            if effective_filter and link.get("relation") != effective_filter:
                                continue
                            prev = link["source"]
                            subgraph_nodes.add(current)
                            subgraph_nodes.add(prev)
                            subgraph_edges.append({
                                "source_id": link["source"], "target_id": link["target"],
                                "source_label": self.nodes.get(prev, {}).get("label", prev),
                                "target_label": self.nodes.get(link["target"], {}).get("label", link["target"]),
                                "relation": link.get("relation"), "confidence": link.get("confidence"),
                                "context": link.get("context", ""), "direction": "reverse",
                            })
                            if prev not in visited:
                                visited.add(prev)
                                if local_degree[prev] < hub_degree or prev == seed_id:
                                    next_frontier.append(prev)
                            if len(subgraph_nodes) >= max_nodes:
                                break
                        if len(subgraph_nodes) >= max_nodes:
                            break
                    frontier = next_frontier
                    if not frontier:
                        break
        else:
            for seed_id, _score in seeds:
                if len(subgraph_nodes) >= max_nodes:
                    break
                visited_dfs: set[str] = set()
                self._dfs_from(seed_id, depth, effective_filter, visited_dfs,
                               subgraph_nodes, subgraph_edges, max_nodes)

        node_list: list[dict[str, Any]] = []
        for i, (sid, sscore) in enumerate(seeds):
            n = self.nodes.get(sid, {})
            node_list.append({
                "id": sid, "label": n.get("label"), "type": n.get("entity_type"),
                "file": n.get("source_file"), "location": n.get("source_location"),
                "details": n.get("details"),
                "score": round(sscore, 1), "is_seed": True,
            })

        for nid in subgraph_nodes:
            if nid in {s[0] for s in seeds}:
                continue
            n = self.nodes.get(nid, {})
            node_list.append({
                "id": nid, "label": n.get("label"), "type": n.get("entity_type"),
                "file": n.get("source_file"), "location": n.get("source_location"),
                "details": n.get("details"),
                "is_seed": False,
            })

        return {
            "question": question,
            "tokens": tokens,
            "inferred_filter": inferred_filter,
            "effective_filter": effective_filter,
            "mode": mode,
            "depth": depth,
            "seeds": [{"id": s[0], "label": self.nodes.get(s[0], {}).get("label"), "score": round(s[1], 1)} for s in seeds],
            "total_nodes": len(node_list),
            "total_edges": len(subgraph_edges),
            "nodes": node_list,
            "edges": subgraph_edges,
        }

    def _query_terms(self, question: str) -> list[str]:
        terms: list[str] = []
        has_cjk = any("\u4e00" <= c <= "\u9fff" or "\u3040" <= c <= "\u30ff" for c in question)
        if has_cjk:
            try:
                import jieba  # type: ignore
                for w in jieba.cut(question):
                    w = w.strip()
                    if w and len(w) >= 1:
                        terms.append(w.lower())
                return terms
            except ImportError:
                pass
        for token in re.findall(r"\w+", question):
            t = token.lower()
            if len(t) <= 2:
                continue
            t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode("ascii")
            if t:
                terms.append(t)
        return terms

    def _compute_idf(self, terms: list[str]) -> dict[str, float]:
        total = len(self.nodes)
        doc_freq: dict[str, int] = defaultdict(int)
        for nid, node in self.nodes.items():
            label = (node.get("label") or "").lower()
            label_tokens = set(re.findall(r"\w+", label))
            for term in terms:
                if term in label:
                    doc_freq[term] += 1
                else:
                    for lt in label_tokens:
                        if term in lt:
                            doc_freq[term] += 1
                            break
        idf: dict[str, float] = {}
        for term in terms:
            df = doc_freq.get(term, 0)
            idf[term] = math.log((total + 1) / (df + 1)) + 1.0 if df > 0 else 1.0
        return idf

    def _score_nodes(self, terms: list[str], idf: dict[str, float]) -> dict[str, float]:
        scores: dict[str, float] = defaultdict(float)
        for nid, node in self.nodes.items():
            label = (node.get("label") or "").lower()
            sf = (node.get("source_file") or "").lower()
            for term in terms:
                idf_w = idf.get(term, 1.0)
                if label == term:
                    scores[nid] += 1000 * idf_w
                elif label.startswith(term):
                    scores[nid] += 100 * idf_w
                elif term in label:
                    scores[nid] += 1 * idf_w
                if term in sf:
                    scores[nid] += 0.5 * idf_w
        return dict(scores)

    def _pick_seeds(self, scores: dict[str, float]) -> list[tuple[str, float]]:
        if not scores:
            return []
        sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        top_score = sorted_scores[0][1]
        seeds: list[tuple[str, float]] = []
        for nid, score in sorted_scores[:10]:
            if top_score > 0 and score < top_score * 0.2:
                break
            seeds.append((nid, score))
            if len(seeds) >= 3:
                break
        return seeds

    def _infer_filter(self, question: str) -> str:
        q = question.lower()
        hint_map = {
            "call": "calls", "calls": "calls", "invoke": "calls",
            "import": "imports", "imports": "imports", "module": "imports",
            "field": "field", "fields": "field", "property": "field", "member": "field",
            "parameter": "parameter_type", "param": "parameter_type",
            "return": "return_type", "returns": "return_type",
            "inherit": "inherits", "inherits": "inherits",
            "contain": "contains", "contains": "contains",
            "implement": "implements", "implements": "implements",
            "export": "exports", "exports": "exports",
            "reference": "references",
        }
        for hint, filt in hint_map.items():
            if hint in q:
                return filt
        return ""

    def _hub_threshold(self) -> int:
        deg_vals = sorted((len(self._adj.get(nid, [])) + len(self._rev_adj.get(nid, [])))
                          for nid in self.nodes)
        if not deg_vals:
            return 50
        p99 = deg_vals[int(len(deg_vals) * 0.99)] if deg_vals else 0
        return max(50, p99)

    def _dfs_from(
        self, node_id: str, depth: int, relation: str,
        visited: set[str], subgraph_nodes: set[str],
        subgraph_edges: list[dict[str, Any]], max_nodes: int
    ):
        if depth <= 0 or node_id in visited or len(subgraph_nodes) >= max_nodes:
            return
        visited.add(node_id)
        for link in self._adj.get(node_id, []):
            if relation and link.get("relation") != relation:
                continue
            nxt = link["target"]
            subgraph_nodes.add(node_id)
            subgraph_nodes.add(nxt)
            subgraph_edges.append({
                "source_id": link["source"], "target_id": link["target"],
                "source_label": self.nodes.get(link["source"], {}).get("label", link["source"]),
                "target_label": self.nodes.get(nxt, {}).get("label", nxt),
                "relation": link.get("relation"), "confidence": link.get("confidence"),
                "context": link.get("context", ""), "direction": "forward",
            })
            if len(subgraph_nodes) >= max_nodes:
                return
            self._dfs_from(nxt, depth - 1, relation, visited, subgraph_nodes, subgraph_edges, max_nodes)

    _HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<script src="https://unpkg.com/vis-network@9.1.6/dist/vis-network.min.js"></script>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #1a1a2e; color: #e0e0e0; }}
  #container {{ display: flex; height: 100vh; }}
  #sidebar {{ width: 340px; background: #16213e; padding: 16px; overflow-y: auto; border-right: 1px solid #0f3460; display: flex; flex-direction: column; gap: 12px; }}
  #sidebar h2 {{ font-size: 16px; color: #e94560; margin-bottom: 4px; }}
  #search {{ width: 100%; padding: 8px 12px; border: 1px solid #0f3460; border-radius: 6px; background: #1a1a2e; color: #e0e0e0; font-size: 13px; }}
  #search:focus {{ outline: none; border-color: #e94560; }}
  #graph {{ flex: 1; }}
  #info {{ font-size: 12px; color: #a0a0b0; }}
  #info b {{ color: #e94560; }}
  #node-detail {{ flex: 1; font-size: 12px; overflow-y: auto; }}
  #node-detail h3 {{ font-size: 14px; color: #e94560; word-break: break-all; }}
  #node-detail .attr {{ color: #7f8c8d; }}
  #node-detail .val {{ color: #e0e0e0; }}
  #node-detail .section {{ margin-top: 8px; padding-top: 6px; border-top: 1px solid #0f3460; }}
  #node-detail .sectitle {{ font-size: 11px; color: #4fc3f7; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }}
  #node-detail .edge-line {{ margin-left: 8px; font-size: 11px; color: #b0b0c0; display: flex; gap: 4px; align-items: baseline; }}
  #node-detail .edge-line .dir {{ color: #7f8c8d; width: 12px; flex-shrink: 0; }}
  #node-detail .edge-line .neighbor {{ color: #e0e0e0; }}
  #node-detail .edge-line .conf {{ color: #7f8c8d; font-size: 10px; }}
  #node-detail .detail-line {{ margin-left: 8px; font-size: 11px; color: #b0b0c0; }}
  #node-detail .detail-line .dname {{ color: #e0e0e0; }}
  #node-detail .detail-line .dtype {{ color: #7f8c8d; }}
  #legend {{ display: flex; flex-wrap: wrap; gap: 6px; }}
  #legend span {{ padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #fff; }}
  .stat {{ font-size: 13px; color: #4fc3f7; }}
  #tooltip {{ display: none; position: fixed; z-index: 9999; background: #0f3460; color: #e0e0e0; border: 1px solid #e94560; border-radius: 6px; padding: 8px 12px; font-size: 11px; line-height: 1.5; max-width: 320px; pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }}
  #tooltip b {{ color: #e94560; }}
</style>
</head>
<body>
<div id="tooltip"></div>
<div id="container">
  <div id="sidebar">
    <h2>Code Graph</h2>
    <div class="stat">{entity_count} entities &middot; {link_count} edges</div>
    <input id="search" type="text" placeholder="Search nodes..." />
    <div id="legend"></div>
    <div id="info">Click a node to inspect</div>
    <div id="node-detail"></div>
  </div>
  <div id="graph"></div>
</div>
<script>
const RAW_NODES = {nodes_json};
const RAW_EDGES = {edges_json};
const LEGEND = {legend_json};
(function() {{
  const container = document.getElementById('graph');
  const legendEl = document.getElementById('legend');
  const infoEl = document.getElementById('info');
  const detailEl = document.getElementById('node-detail');
  const searchEl = document.getElementById('search');
  const tooltipEl = document.getElementById('tooltip');

  // Build node lookup map
  const nodeMap = {{}};
  RAW_NODES.forEach(function(n) {{ nodeMap[n.id] = n; }});

  LEGEND.forEach(function(l) {{
    const s = document.createElement('span');
    s.textContent = l.label;
    s.style.background = l.color;
    legendEl.appendChild(s);
  }});

  const data = {{ nodes: new vis.DataSet(RAW_NODES), edges: new vis.DataSet(RAW_EDGES) }};
  const options = {{
    physics: {{ solver: 'forceAtlas2Based', forceAtlas2Based: {{ gravitationalConstant: -30, centralGravity: 0.005, springLength: 120, springConstant: 0.04 }} }},
    edges: {{ arrows: {{ to: {{ enabled: true, scaleFactor: 0.6 }} }}, smooth: {{ type: 'continuous' }}, font: {{ size: 9, color: '#a0a0b0', background: 'rgba(26,26,46,0.8)', strokeWidth: 0 }} }},
    nodes: {{ shape: 'dot', borderWidth: 0 }},
    interaction: {{ hover: true, tooltipDelay: 100, zoomView: true, dragView: true }},
  }};
  const network = new vis.Network(container, data, options);

  network.on('stabilizationIterationsDone', function() {{ network.setOptions({{ physics: false }}); }});
  network.stabilize(200);

  // ---- Custom tooltip on hover ----
  network.on('hoverNode', function(params) {{
    const node = RAW_NODES.find(function(n) {{ return n.id === params.node; }});
    if (!node) return;
    const edges = RAW_EDGES.filter(function(e) {{ return e.from === node.id || e.to === node.id; }});

    const lines = [];
    lines.push('<b>' + esc(node.label || node.id) + '</b> (' + esc(node.file_type || '?') + ')');
    lines.push('<span style="color:#7f8c8d">File:</span> ' + esc(node.source_file || '?'));

    // Detail summary from details field
    if (node.details && node.details.length) {{
      const methods = node.details.filter(function(d) {{ return d.kind === 'method_signature'; }});
      const props = node.details.filter(function(d) {{ return d.kind === 'property'; }});
      const enums = node.details.filter(function(d) {{ return d.kind === 'enum_member'; }});
      const parts = [];
      if (methods.length) parts.push(methods.length + ' methods');
      if (props.length) parts.push(props.length + ' properties');
      if (enums.length) parts.push(enums.length + ' enum members');
      if (parts.length) lines.push(parts.join(', '));
    }}

    // Inheritance
    const inheritsFrom = edges.filter(function(e) {{ return e.label === 'inherits' && e.from === node.id; }});
    const implementsE = edges.filter(function(e) {{ return e.label === 'implements' && e.from === node.id; }});
    if (inheritsFrom.length) {{
      const parents = inheritsFrom.map(function(e) {{ return (nodeMap[e.to] && nodeMap[e.to].label) || e.to; }});
      lines.push('extends: ' + parents.join(', '));
    }}
    if (implementsE.length) {{
      const ifaces = implementsE.map(function(e) {{ return (nodeMap[e.to] && nodeMap[e.to].label) || e.to; }});
      lines.push('implements: ' + ifaces.join(', '));
    }}

    lines.push('Connections: ' + edges.length + ' | Click for details');

    tooltipEl.innerHTML = lines.join('<br>');
    tooltipEl.style.display = 'block';
    tooltipEl.style.left = (params.event.clientX + 15) + 'px';
    tooltipEl.style.top = (params.event.clientY + 10) + 'px';
  }});

  network.on('blurNode', function() {{
    tooltipEl.style.display = 'none';
  }});

  // ---- Sidebar on click (grouped by relation) ----
  network.on('click', function(params) {{
    if (params.nodes.length === 1) {{
      const nid = params.nodes[0];
      const node = RAW_NODES.find(function(n) {{ return n.id === nid; }});
      if (!node) return;
      const edges = RAW_EDGES.filter(function(e) {{ return e.from === nid || e.to === nid; }});

      // Group edges by relation and direction
      const groups = {{
        inherits_out: {{ title: 'EXTENDS (inherits)', items: [] }},
        inherits_in: {{ title: 'EXTENDED BY (inherits)', items: [] }},
        implements_out: {{ title: 'IMPLEMENTS', items: [] }},
        implements_in: {{ title: 'IMPLEMENTED BY', items: [] }},
        contains_in: {{ title: 'MEMBERS (methods/props)', items: [] }},
        calls_out: {{ title: 'CALLS', items: [] }},
        calls_in: {{ title: 'CALLED BY', items: [] }},
        imports_out: {{ title: 'IMPORTS', items: [] }},
        imports_in: {{ title: 'IMPORTED BY', items: [] }},
        exports_out: {{ title: 'EXPORTS', items: [] }},
        other_out: {{ title: 'OTHER OUT', items: [] }},
        other_in: {{ title: 'OTHER IN', items: [] }},
      }};

      edges.forEach(function(e) {{
        const isOut = e.from === nid;
        const rel = e.label || '?';
        const otherId = isOut ? e.to : e.from;
        const other = nodeMap[otherId] || {{ label: otherId, file_type: '?' }};
        const dir = isOut ? '→' : '←';
        const entry = {{
          dir: dir, label: other.label || otherId,
          type: other.file_type || '?',
          rel: rel, confidence: e.confidence || '?',
        }};

        let groupKey = '';
        if (rel === 'inherits') groupKey = isOut ? 'inherits_out' : 'inherits_in';
        else if (rel === 'implements') groupKey = isOut ? 'implements_out' : 'implements_in';
        else if (rel === 'contains') groupKey = isOut ? 'other_out' : 'contains_in';
        else if (rel === 'calls') groupKey = isOut ? 'calls_out' : 'calls_in';
        else if (rel === 'imports') groupKey = isOut ? 'imports_out' : 'imports_in';
        else if (rel === 'exports') groupKey = isOut ? 'exports_out' : 'other_in';
        else groupKey = isOut ? 'other_out' : 'other_in';
        groups[groupKey].items.push(entry);
      }});

      // Build HTML
      var html = '<h3>' + esc(node.label || nid) + '</h3>'
        + '<div class="attr">Type: <span class="val">' + esc(node.file_type || '?') + '</span></div>'
        + '<div class="attr">File: <span class="val">' + esc(node.source_file || '?') + '</span></div>'
        + '<div class="attr">Degree: <span class="val">' + (node.degree || 0) + '</span></div>'
        + '<div class="attr">Community: <span class="val">' + esc(node.community_name || '?') + '</span></div>';

      // ---- DETAILS section (properties / method signatures / enum members) ----
      if (node.details && node.details.length) {{
        html += '<div class="section"><div class="sectitle">DETAILS</div>';
        node.details.forEach(function(d) {{
          var extra = '';
          if (d.type) extra += ' <span class="dtype">' + esc(d.type) + '</span>';
          if (d.value) extra += ' <span class="dtype">= ' + esc(d.value) + '</span>';
          var kindTag = '<span style="font-size:9px;color:#f39c12">[' + d.kind + ']</span> ';
          html += '<div class="detail-line">' + kindTag + '<span class="dname">' + esc(d.name) + '</span>' + extra + '</div>';
        }});
        html += '</div>';
      }}

      // ---- Grouped edge sections ----
      const sectionOrder = ['contains_in', 'inherits_out', 'inherits_in', 'implements_out', 'implements_in', 'calls_out', 'calls_in', 'imports_out', 'imports_in', 'exports_out', 'other_out', 'other_in'];
      sectionOrder.forEach(function(key) {{
        const g = groups[key];
        if (!g.items.length) return;
        html += '<div class="section"><div class="sectitle">' + g.title + ' (' + g.items.length + ')</div>';
        g.items.slice(0, 15).forEach(function(e) {{
          html += '<div class="edge-line"><span class="dir">' + e.dir + '</span><span class="neighbor">' + esc(e.label) + '</span><span class="conf">[' + esc(e.confidence) + ']</span></div>';
        }});
        if (g.items.length > 15) {{
          html += '<div class="detail-line" style="color:#7f8c8d">... and ' + (g.items.length - 15) + ' more</div>';
        }}
        html += '</div>';
      }});

      detailEl.innerHTML = html;
      infoEl.innerHTML = '<b>' + edges.length + '</b> connections for <b>' + esc(node.label || nid) + '</b>';
    }}
  }});

  searchEl.addEventListener('input', function() {{
    var q = searchEl.value.toLowerCase();
    if (!q) {{ network.unselectAll(); detailEl.innerHTML = ''; infoEl.textContent = 'Click a node to inspect'; return; }}
    var matches = RAW_NODES.filter(function(n) {{ return (n.label || '').toLowerCase().indexOf(q) !== -1 || (n.source_file || '').toLowerCase().indexOf(q) !== -1; }}).slice(0, 20);
    network.selectNodes(matches.map(function(n) {{ return n.id; }}));
    if (matches.length === 0) {{
      infoEl.innerHTML = 'No matches for "<b>' + esc(q) + '</b>"';
    }} else {{
      infoEl.innerHTML = matches.length + ' match(es) for "<b>' + esc(q) + '</b>"';
    }}
  }});

  function esc(s) {{ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }}
}})();
</script>
</body>
</html>"""

    def resolve(self, label: str) -> dict[str, Any]:
        """Fuzzy-resolve a human-readable label (e.g. 'Logger.error') to a node ID."""
        q = label.lower().strip()
        best_match = None
        best_score = 0
        candidates: list[dict[str, Any]] = []

        for nid, node in self.nodes.items():
            nl = (node.get("label") or "").lower()
            if not nl:
                continue
            score = 0
            if nl == q:
                score = 100
            elif nl.endswith("." + q):
                score = 90
            elif q in nl:
                score = 70 - abs(len(nl) - len(q)) * 0.1
            elif nl in q:
                score = 50 - abs(len(q) - len(nl)) * 0.1

            if score > 0:
                summary = {
                    "id": nid,
                    "label": node.get("label"),
                    "type": node.get("entity_type"),
                    "file": node.get("source_file"),
                    "location": node.get("source_location"),
                    "details": node.get("details"),
                    "score": round(score, 1),
                }
                candidates.append(summary)
                if score > best_score:
                    best_score = score
                    best_match = summary

        candidates.sort(key=lambda x: x["score"], reverse=True)
        result: dict[str, Any] = {"query": label, "matches": len(candidates)}
        if best_match:
            result["best_match"] = best_match
        if len(candidates) <= 10:
            result["candidates"] = candidates
        else:
            result["candidates"] = candidates[:10]
            result["total_candidates"] = len(candidates)
        return result

    def expand(self, node_id: str, hops: int = 2, relation: str = "", max_nodes: int = 50) -> dict[str, Any]:
        """BFS expansion from a seed node, returning a scoped subgraph."""
        node = self.nodes.get(node_id)
        if not node:
            return {"error": f"Node '{node_id}' not found"}

        visited_nodes: set[str] = {node_id}
        edges: list[dict[str, Any]] = []
        frontier = [node_id]

        for _ in range(hops):
            next_frontier: list[str] = []
            for current in frontier:
                for link in self._adj.get(current, []):
                    if relation and link.get("relation") != relation:
                        continue
                    nxt = link["target"]
                    edges.append({
                        "source_id": link["source"],
                        "target_id": link["target"],
                        "source_label": self.nodes.get(link["source"], {}).get("label", link["source"]),
                        "target_label": self.nodes.get(nxt, {}).get("label", nxt),
                        "relation": link.get("relation"),
                        "confidence": link.get("confidence"),
                        "context": link.get("context", ""),
                        "direction": "forward",
                    })
                    if nxt not in visited_nodes:
                        visited_nodes.add(nxt)
                        next_frontier.append(nxt)
                        if len(visited_nodes) >= max_nodes:
                            break
                if len(visited_nodes) >= max_nodes:
                    break
                for link in self._rev_adj.get(current, []):
                    if relation and link.get("relation") != relation:
                        continue
                    prev = link["source"]
                    edges.append({
                        "source_id": link["source"],
                        "target_id": link["target"],
                        "source_label": self.nodes.get(prev, {}).get("label", prev),
                        "target_label": self.nodes.get(link["target"], {}).get("label", link["target"]),
                        "relation": link.get("relation"),
                        "confidence": link.get("confidence"),
                        "context": link.get("context", ""),
                        "direction": "reverse",
                    })
                    if prev not in visited_nodes:
                        visited_nodes.add(prev)
                        next_frontier.append(prev)
                        if len(visited_nodes) >= max_nodes:
                            break
                if len(visited_nodes) >= max_nodes:
                    break
            frontier = next_frontier
            if not frontier:
                break

        node_list: list[dict[str, Any]] = []
        for nid in visited_nodes:
            n = self.nodes.get(nid, {})
            node_list.append({
                "id": nid,
                "label": n.get("label"),
                "type": n.get("entity_type"),
                "file": n.get("source_file"),
                "location": n.get("source_location"),
                "details": n.get("details"),
            })

        return {
            "seed": self._node_summary(node),
            "hops": hops,
            "total_nodes": len(visited_nodes),
            "total_edges": len(edges),
            "nodes": node_list,
            "edges": edges,
        }

    def reverse_trace_calls(self, node_id: str, max_depth: int = 3, max_steps: int = 40) -> dict[str, Any]:
        """Trace incoming callers (who calls this function?) following _rev_adj call edges."""
        node = self.nodes.get(node_id)
        if not node:
            return {"error": f"Node '{node_id}' not found"}

        calls_by_target: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        for link in self._calls_by_source.values():
            pass
        for nid in self._calls_by_source:
            for link in self._calls_by_source[nid]:
                calls_by_target[link["target"]].append(link)

        steps: list[dict[str, Any]] = []
        visited: set[str] = set()

        def _trace(eid: str, depth: int):
            if depth > max_depth or eid in visited:
                return
            visited.add(eid)
            for link in calls_by_target.get(eid, []):
                caller = self.nodes.get(link["source"], {})
                callee_node = self.nodes.get(eid, {})
                ctx = link.get("context", "")
                ctx_tags = []
                if "(self)" in ctx:
                    ctx_tags.append("self")
                for kw in ("[if]", "[else]", "[loop]", "[switch]", "[try]", "[catch]"):
                    if kw in ctx:
                        ctx_tags.append(kw.strip("[]"))
                steps.append({
                    "caller_id": link["source"],
                    "caller_label": caller.get("label", link["source"]),
                    "caller_file": caller.get("source_file", ""),
                    "callee_id": eid,
                    "callee_label": callee_node.get("label", eid),
                    "relation": "calls",
                    "confidence": link.get("confidence", "?"),
                    "context_tags": ctx_tags,
                    "location": link.get("source_location", ""),
                })
                if len(steps) >= max_steps:
                    return
                _trace(link["source"], depth + 1)

        _trace(node_id, 0)

        return {
            "entry": self._node_summary(node),
            "depth": max_depth,
            "total_steps": len(steps),
            "steps": steps,
        }

    def get_diagram_path(self, entity_id: str) -> dict[str, Any]:
        index_path = os.path.join(self.diagrams_dir, "INDEX.json")
        if not os.path.exists(index_path):
            return {"error": "INDEX.json not found. Generate diagrams first with mermaid_seq.py --out-dir"}

        with open(index_path) as f:
            index = json.load(f)

        if entity_id in index:
            full_path = os.path.join(self.diagrams_dir, index[entity_id])
            return {
                "entity_id": entity_id,
                "diagram_path": full_path,
                "relative_path": index[entity_id],
                "exists": os.path.exists(full_path),
            }

        for key in index:
            if entity_id.lower() in key.lower():
                full_path = os.path.join(self.diagrams_dir, index[key])
                return {
                    "entity_id": entity_id,
                    "matched_id": key,
                    "diagram_path": full_path,
                    "relative_path": index[key],
                    "exists": os.path.exists(full_path),
                }

        return {"error": f"No diagram found for '{entity_id}'"}

    @staticmethod
    def _node_summary(node: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": node.get("id"),
            "label": node.get("label"),
            "type": node.get("entity_type"),
            "file": node.get("source_file"),
            "location": node.get("source_location"),
            "details": node.get("details"),
        }
