# Packet-first document writing

Load one template at a time. `scripts/render_documents.py` owns generated markers, canonical
headings, metadata, stable paths, relative links, tables, evidence lists, and governance
scaffolds. Run it before narrative writing to create missing files; by default it preserves an
existing generated region. The model fills only evidence-backed narrative slots and optional
packet-driven sections; it must not rewrite repetitive scaffolding or perform repository-wide
discovery.

Project Business owns grouped observable behavior. Project and module Architecture own
responsibility, dependency direction, lifecycle, state/data, contracts, integrations, extension
seams, and blast radius. Emit a diagram only when the packet records a useful architectural
question and verified relationships. Governance is self-contained ARC/LIM entries and never a
copied Architecture section or a CHK/Change Checks table.
