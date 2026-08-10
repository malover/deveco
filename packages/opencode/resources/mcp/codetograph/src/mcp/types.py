from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    inputSchema: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": self.inputSchema,
        }


@dataclass(frozen=True)
class TextContent:
    type: str
    text: str

    def to_dict(self) -> dict[str, str]:
        return {"type": self.type, "text": self.text}
