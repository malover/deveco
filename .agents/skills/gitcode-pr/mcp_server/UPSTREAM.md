# Upstream source

This directory vendors the runtime files from
[`ZoroPoskai/gitcode-mcp-server`](https://github.com/ZoroPoskai/gitcode-mcp-server)
at commit `787404033e1a17c3be7d041344e4c994bef6cd5d`.

Included upstream files:

- `server.py`
- `requirements.txt`
- `LICENSE`

The upstream project is licensed under the MIT License. Its unmodified license
text is included in `LICENSE`. The files above are intentionally bundled so
that a user enabling this skill needs only a Python virtual environment and
dependency installation; the runtime setup must not clone the upstream
repository.

To update the bundled implementation, obtain a reviewed upstream revision,
copy the corresponding runtime files, retain its license, update this commit
reference, and verify the selected `GITCODE_TOOLSETS` still exposes every tool
used by `SKILL.md`.
