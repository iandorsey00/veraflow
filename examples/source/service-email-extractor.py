"""Partial, offline extraction for the fictional service-intake email."""

import argparse
import json
import re
from pathlib import Path

# These patterns recognize the wording in the example, including the count of
# failed displays. Unmatched fields are omitted from the candidate record.
RULES = [
    ("model", r"purchased \w+ (V\d+) displays", "direct"),
    ("quantity_affected", r"\b(One|[0-9]+) stopped turning on", "inferred"),
    ("serial_number", r"serial number is ([A-Z0-9]+)\b", "direct"),
]


def candidates_from_email(text, allowed_ids):
    candidates = {}
    lines = text.splitlines()
    for field_id, pattern, origin in RULES:
        if field_id not in allowed_ids:
            continue
        alternatives = {}
        for number, line in enumerate(lines, 1):
            for match in re.finditer(pattern, line):
                value = match[1]
                if field_id == "quantity_affected" and value == "One":
                    value = "1"
                entry = alternatives.setdefault(
                    value, {"value": value, "origin": origin, "evidence": []}
                )
                if len(entry["evidence"]) < 5:
                    entry["evidence"].append({"quote": match[0], "line": number})
        if alternatives:
            if len(alternatives) > 20:
                raise ValueError(f"Too many alternatives for {field_id}")
            candidates[field_id] = {
                "status": "found" if len(alternatives) == 1 else "ambiguous",
                "alternatives": list(alternatives.values()),
            }
    return {"format": "veraflow-candidates", "version": 1, "candidates": candidates}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--fields", type=Path, help="Optional VeraFlow field-description export")
    args = parser.parse_args()
    allowed_ids = {rule[0] for rule in RULES}
    if args.fields:
        definition = json.loads(args.fields.read_text(encoding="utf-8"))
        if (
            definition.get("format") != "veraflow-extraction-fields"
            or definition.get("version") != 1
        ):
            parser.error("Expected a VeraFlow extraction-fields v1 file")
        allowed_ids &= {field["id"] for field in definition["fields"]}
    result = candidates_from_email(args.email.read_text(encoding="utf-8"), allowed_ids)
    with args.output.open("x", encoding="utf-8") as output:
        output.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
