#!/usr/bin/env python3
import argparse
import datetime as _dt
import re
from typing import Callable, List, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def _is_third_party_url(url: str) -> bool:
    u = url.strip()
    return u.startswith("http://") or u.startswith("https://") or u.startswith("//")


def _looks_like_static_asset(url: str) -> bool:
    lower = url.lower()
    return ".css" in lower or ".js" in lower


def _update_v_param(url: str, v_value: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["v"] = v_value
    new_query = urlencode(query, doseq=True)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))


def _rewrite_tag_attr(
    *,
    tag: str,
    attr_name: str,
    kind: str,
    v_value: str,
    skip_if_integrity: bool,
    changes: List[Tuple[str, str, str]],
) -> str:
    if skip_if_integrity and re.search(r"\bintegrity\s*=", tag, flags=re.IGNORECASE):
        return tag

    attr_re = re.compile(
        rf"\b{re.escape(attr_name)}\s*=\s*(?P<q>['\"])(?P<url>.*?)(?P=q)",
        flags=re.IGNORECASE | re.DOTALL,
    )

    m = attr_re.search(tag)
    if not m:
        return tag

    url = m.group("url")
    if _is_third_party_url(url):
        return tag

    new_url = _update_v_param(url, v_value)
    if new_url == url:
        return tag

    changes.append((kind, url, new_url))
    q = m.group("q")
    start, end = m.span("url")
    return tag[:start] + new_url + tag[end:]


def _sub_with_callback(pattern: re.Pattern[str], text: str, cb: Callable[[re.Match[str]], str]) -> str:
    return pattern.sub(lambda m: cb(m), text)


def process_html(html: str, v_value: str) -> Tuple[str, List[Tuple[str, str, str]]]:
    changes: List[Tuple[str, str, str]] = []

    link_pat = re.compile(r"<link\b[^>]*>", re.IGNORECASE)
    script_pat = re.compile(r"<script\b[^>]*>", re.IGNORECASE)

    def rewrite_link(m: re.Match[str]) -> str:
        tag = m.group(0)
        if not re.search(r"\bhref\s*=", tag, flags=re.IGNORECASE):
            return tag
        return _rewrite_tag_attr(
            tag=tag,
            attr_name="href",
            kind="link",
            v_value=v_value,
            skip_if_integrity=True,
            changes=changes,
        )

    def rewrite_script(m: re.Match[str]) -> str:
        tag = m.group(0)
        if not re.search(r"\bsrc\s*=", tag, flags=re.IGNORECASE):
            return tag
        return _rewrite_tag_attr(
            tag=tag,
            attr_name="src",
            kind="script",
            v_value=v_value,
            skip_if_integrity=True,
            changes=changes,
        )

    out = html
    out = _sub_with_callback(link_pat, out, rewrite_link)
    out = _sub_with_callback(script_pat, out, rewrite_script)

    return out, changes


def main() -> int:
    p = argparse.ArgumentParser(add_help=True)
    p.add_argument("--file", action="append", default=[])
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--timestamp", default="")
    args = p.parse_args()

    v_value = args.timestamp.strip() or _dt.datetime.now().strftime("%Y%m%d_%H%M")

    files = args.file or ["index.html"]
    any_changes = False

    for file_path in files:
        with open(file_path, "r", encoding="utf-8") as f:
            html = f.read()

        new_html, changes = process_html(html, v_value)

        filtered: List[Tuple[str, str, str]] = []
        for kind, old, new in changes:
            if _looks_like_static_asset(old):
                filtered.append((kind, old, new))

        if not filtered:
            print(f"{file_path}: no changes")
            continue

        any_changes = True
        for kind, old, new in filtered:
            print(f"{file_path}: {kind}: {old} -> {new}")

        if args.dry_run:
            continue

        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_html)

        print(f"{file_path}: updated")

    if args.dry_run:
        print("dry-run: not writing files")

    return 0 if any_changes or args.dry_run else 0


if __name__ == "__main__":
    raise SystemExit(main())
