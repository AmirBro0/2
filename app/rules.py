from functools import lru_cache
from importlib.resources import files
import json


@lru_cache(maxsize=1)
def rule_catalog() -> dict[str, dict]:
    path = files("app").joinpath("rules.json")
    rules = json.loads(path.read_text(encoding="utf-8"))
    ids = [item["id"] for item in rules]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate rule IDs in rules.json")
    return {item["id"]: item for item in rules}
