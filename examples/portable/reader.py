#!/usr/bin/env python3
"""Independent renderer for the portable profile. Uses only Python's standard library."""
import datetime
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

ID = r"[A-Za-z0-9_-]+"
QUOTED = r'"(?:[^"\\\x00-\x1f]|\\[^\x00-\x1f])*"'
TRIM = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
HEADERS = ["subject", "to", "cc", "bcc"]
DECLARATION = r"(?:text|textarea|email|date|number|select|radio|dropdown|checkbox|switch|choice)"
DIRECTIVE = rf"(?:{DECLARATION} {ID}\??|when {ID}[^\S\r\n]*=[^\S\r\n]*{ID}):"
BRACE = re.compile(r'\\(?:\\|\{\{)|\{\{(' + rf'\s*{DIRECTIVE}(?:[^"<>{{}}\r\n]|{QUOTED})*' + r')\}\}|\{\{([^<>{}\r\n]+)\}\}')
PLAIN = re.compile(r"\\(?:\\|\{\{)|\{\{([^<>{}\r\n]+)\}\}")
ANGLE = re.compile(r"\\(?:\\|<)|<([^<>{}\s]+)>")


def trim(text):
    return text.strip(TRIM)


def forbidden(text):
    return any(unicodedata.category(ch) in {"Cc", "Cf", "Zl", "Zp"} for ch in text)


def tokens(text, style, dynamic=False):
    pattern = ANGLE if style == "angle" else BRACE if dynamic else PLAIN
    at = 0
    for match in pattern.finditer(text):
        raw = match[0]
        groups = match.groups()
        name = next((g for g in groups if g is not None), None)
        if name is not None:
            cleaned = trim(name)
            if forbidden(name) or not cleaned:
                continue
            name = cleaned
        if at < match.start():
            yield text[at:match.start()], None
        yield (raw[1:], None) if name is None else (raw, name)
        at = match.end()
    if at < len(text):
        yield text[at:], None


def string(literal):
    value = json.loads(literal)
    if "\0" in value:
        raise ValueError("invalidFormDirective")
    return value


def option_map(source):
    result = {}
    while source:
        item = re.match(rf"\s*({ID})\s*=\s*({QUOTED})\s*", source)
        if not item or item[1] in result or len(result) == 100:
            raise ValueError("invalidFormDirective")
        result[item[1]] = string(item[2])
        source = source[item.end():]
        if not source:
            break
        if not source.startswith("|") or not trim(source[1:]):
            raise ValueError("invalidFormDirective")
        source = source[1:]
    if not result:
        raise ValueError("invalidFormDirective")
    return result


def directive(name):
    clause = re.fullmatch(rf"when ({ID})\s*=\s*({ID}):\s*({QUOTED})", name)
    if clause:
        return clause[1], None, {clause[2]: string(clause[3])}
    declaration = re.fullmatch(
        rf"(select|radio|dropdown|checkbox|switch|choice) ({ID}):\s*(.*)", name
    )
    if declaration:
        kind, field, source = declaration.groups()
        options = option_map(source)
        if kind == "choice":
            return field, None, options
        boolean = kind in {"checkbox", "switch"}
        if boolean and set(options) != {"yes", "no"}:
            raise ValueError("invalidFormDirective")
        return field, dict(kind=kind, options=options,
                           default="no" if boolean else next(iter(options))), None
    entry = re.fullmatch(
        rf"(text|textarea|email|date|number) ({ID})(\?)?:(?:\s*({QUOTED}))?"
        rf"(?:\s*when ({ID})=({ID}))?\s*", name
    )
    if entry:
        kind, field, optional, default, dependency, value = entry.groups()
        control = dict(kind=kind, optional=bool(optional))
        if default is not None:
            control["default"] = string(default)
        if dependency:
            control["when"] = (dependency, value)
        return field, control, None
    if re.match(DIRECTIVE, name):
        raise ValueError("invalidFormDirective")
    return name, None, None


def valid(control, value):
    if "options" in control:
        return value in control["options"]
    kind = control["kind"]
    if kind == "number":
        return bool(re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", value)) and math.isfinite(float(value))
    if kind == "date":
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
            return False
        try:
            return datetime.date.fromisoformat(value).isoformat() == value
        except ValueError:
            return False
    if kind == "email":
        parts = value.split("@")
        return (len(parts) == 2 and all(parts) and "." in parts[1][1:-1]
                and not any(ch in TRIM or ch in "<>" for ch in value))
    return bool(trim(value))


def visible(control, values):
    condition = control.get("when")
    return condition is None or values.get(condition[0]) == condition[1]


def render_plain(text, values):
    return "".join(raw if name is None else lookup(values, name)
                   for raw, name in tokens(text, "braces"))


def lookup(values, name):
    if name not in values:
        raise ValueError("missingValue")
    return values[name]


def render(template, supplied):
    email = template.get("email", {})
    enabled = email.get("enabled", False)
    sources = []
    if enabled:
        active = {"to": True, "subject": email.get("subjectEnabled", True),
                  "cc": email["ccEnabled"], "bcc": email["bccEnabled"]}
        sources.extend((key, email[key]) for key in email.get("order", HEADERS)
                       if active[key])
    sources.append(("body", template["content"]))
    controls = {}
    parsed = []
    style = template.get("placeholderStyle", "angle")
    for key, text in sources:
        part = []
        for raw, name in tokens(text, style, True):
            if name is None:
                part.append((raw, None, None))
                continue
            field, control, choices = directive(name) if style == "braces" else (name, None, None)
            if control:
                if field in controls or field in template.get("extraFields", []):
                    raise ValueError("invalidFormDirective")
                controls[field] = control
            part.append((raw, field, choices))
        parsed.append((key, part))
    values = dict(supplied)
    for field, control in controls.items():
        condition = control.get("when")
        if condition and condition[1] not in controls.get(condition[0], {}).get("options", {}):
            raise ValueError("invalidFormDirective")
        if "default" in control:
            if not valid(control, control["default"]):
                raise ValueError("invalidFormDirective")
            values.setdefault(field, control["default"])
        elif control.get("optional"):
            values.setdefault(field, "")
    for _, part in parsed:
        for _, field, choices in part:
            if choices is not None and not choices.keys() <= controls.get(field, {}).get("options", {}).keys():
                raise ValueError("invalidFormDirective")
    for field, control in controls.items():
        if visible(control, values):
            value = lookup(values, field)
            if not (control.get("optional") and value == "") and not valid(control, value):
                raise ValueError("invalidControlValue")
    output = []
    for key, part in parsed:
        segments = []
        for raw, field, choices in part:
            if field is None:
                segments.append(raw)
                continue
            control = controls.get(field, {})
            if not visible(control, values):
                continue
            value = lookup(values, field)
            mapping = choices if choices is not None else control.get("options")
            if mapping is not None:
                value = mapping.get(value, "")
            segments.append(value if key == "body" else trim(value))
        text = "".join(segments)
        if key != "body":
            text = trim(text)
        output.append(dict(key=key, text=text))
    if enabled:
        for part in output:
            if part["key"] in {"subject", "to"} and not part["text"]:
                raise ValueError("emailRequired")
        for part in output:
            if part["key"] != "body" and any(
                unicodedata.category(ch) in {"Cc", "Zl", "Zp"} for ch in part["text"]
            ):
                raise ValueError("emailHeaderInvalid")
    return output


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def definition(path):
    archive = read(path)
    if archive["format"] != "veraflow-templates" or archive["version"] != 1:
        raise ValueError("Unsupported template archive")
    return archive["templates"][0]


def check():
    folder = Path(__file__).resolve().parent
    cases = read(folder / "cases.json")
    for case in cases:
        try:
            result = (render(definition(folder / case["archive"]), case["values"])
                      if "archive" in case else render_plain(case["text"], case["values"]))
        except ValueError as error:
            if str(error) != case.get("error"):
                raise AssertionError(case["name"]) from error
        else:
            if "error" in case or result != case.get("parts", case.get("output")):
                raise AssertionError(f"{case['name']}: {result!r}")
    print(f"{len(cases)} portable rendering fixtures passed")


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        check()
    elif len(sys.argv) == 4 and sys.argv[1] == "--plain":
        source = Path(sys.argv[2]).read_bytes().decode("utf-8-sig")
        sys.stdout.buffer.write(render_plain(source, read(sys.argv[3])).encode("utf-8"))
    elif len(sys.argv) == 3:
        print(json.dumps(render(definition(sys.argv[1]), read(sys.argv[2])), ensure_ascii=False, indent=2))
    else:
        sys.exit("Usage: reader.py --check | reader.py TEMPLATE.json VALUES.json | reader.py --plain TEMPLATE.txt VALUES.json")
