"""Mirrors `packages/gofish-graphics/stories/bluefish/PythonTutor/types.ts`."""

from typing import Union


def pointer(value: int) -> dict:
    return {"type": "pointer", "value": value}


def is_pointer(v) -> bool:
    return isinstance(v, dict) and v.get("type") == "pointer"


def format_value(value: Union[str, int, dict]) -> str:
    if isinstance(value, (str, int)):
        return f"{value}"
    return str(value["value"])


def tuple_(values: list) -> dict:
    return {"type": "tuple", "values": values}


def binding(variable: str, value) -> dict:
    return {"variable": variable, "value": value}
