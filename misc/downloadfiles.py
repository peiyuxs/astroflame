from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from http.client import HTTPException
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


DEFAULT_PSI_ID = "PSI-26"
BASE_URL = "https://psi.nasa.gov"
API_ROOT = f"{BASE_URL}/geode-py/ws"
USER_AGENT = "Mozilla/5.0 (compatible; PSI-26-downloader/1.0)"
CHUNK_SIZE = 1024 * 1024
MAX_ATTEMPTS = 3
DOWNLOAD_IGNORE_RULES = "*\n!.gitignore\n"


def validate_psi_id(psi_id: str) -> str:
    psi_id = psi_id.strip().upper()
    if not re.fullmatch(r"PSI-[A-Z0-9][A-Z0-9-]*", psi_id):
        raise ValueError("Use a NASA investigation ID such as PSI-26.")
    return psi_id


def api_request(
    url: str, psi_id: str, payload: dict | None = None
) -> bytes:
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Origin": BASE_URL,
        "Referer": f"{BASE_URL}/physci/repo/data/investigations/{psi_id}",
        "User-Agent": USER_AGENT,
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")

    request = Request(url, data=data, headers=headers)
    try:
        with urlopen(request, timeout=60) as response:
            return response.read()
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(
            f"NASA API returned HTTP {exc.code} for {url}: {details}"
        ) from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach NASA API at {url}: {exc.reason}") from exc


def api_json(url: str, psi_id: str, payload: dict | None = None) -> dict:
    try:
        result = json.loads(api_request(url, psi_id, payload))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"NASA API returned invalid JSON for {url}") from exc
    if not isinstance(result, dict):
        raise RuntimeError(f"NASA API returned an unexpected response for {url}")
    return result


def flatten_files(nodes: list) -> list[dict]:
    files = []
    for node in nodes:
        if not isinstance(node, dict):
            raise RuntimeError("NASA file listing contained an unexpected entry.")
        if node.get("visible") is False:
            continue
        if node.get("directory") is False:
            files.append(node)
            continue
        children = node.get("files")
        if not isinstance(children, list):
            raise RuntimeError("NASA file listing contained an unexpected entry.")
        files.extend(flatten_files(children))
    return files


def get_branches(nodes: list) -> list[tuple[str, list[dict]]]:
    branches = []
    root_files = []
    for node in nodes:
        if not isinstance(node, dict):
            raise RuntimeError("NASA file listing contained an unexpected entry.")
        if node.get("visible") is False:
            continue
        if node.get("directory") is False:
            root_files.append(node)
            continue

        children = node.get("files")
        if not isinstance(children, list):
            raise RuntimeError("NASA file listing contained an unexpected entry.")
        files = flatten_files(children)
        name = node.get("displayName")
        if not name:
            key = node.get("key", "").rstrip("/")
            name = PurePosixPath(key).name or "Other files"
        if files:
            branches.append((name, files))

    if root_files:
        branches.append(("Other files", root_files))

    for branch_name, files in branches:
        for item in files:
            size = item.get("bytes_size")
            valid_size = (
                not isinstance(size, bool)
                and isinstance(size, (int, float))
                and math.isfinite(size)
                and size >= 0
                and int(size) == size
            )
            missing = []
            if not valid_size:
                missing.append("a valid whole-byte size")
            else:
                item["bytes_size"] = int(size)
            if not item.get("key"):
                missing.append("a file path")
            if not item.get("id"):
                missing.append("a download ID")
            if not isinstance(item.get("version"), int):
                missing.append("an integer version")
            if missing:
                key = item.get("key") or item.get("displayName") or "<unknown>"
                raise RuntimeError(
                    f"NASA file listing entry {key!r} in branch "
                    f"{branch_name!r} is missing {', '.join(missing)}."
                )
    return branches


def get_file_listing(
    psi_id: str,
) -> tuple[int, list[tuple[str, list[dict]]]]:
    study = api_json(f"{API_ROOT}/repo/investigations/{psi_id}", psi_id)
    study_version = study.get("version")
    if not isinstance(study_version, int):
        raise RuntimeError("The NASA response did not include a valid study version.")

    listing = api_json(
        f"{API_ROOT}/files/v2",
        psi_id,
        {
            "folder": f"{psi_id}/",
            "fileType": "study",
            "studyId": psi_id,
            "version": study_version,
            "obfuscationcode": "",
        },
    )
    nodes = listing.get("files")
    if not isinstance(nodes, list):
        raise RuntimeError("The NASA response did not include a file list.")
    return study_version, get_branches(nodes)


def relative_path(file_record: dict, psi_id: str) -> PurePosixPath:
    prefix = f"psi-data/{psi_id}/"
    key = file_record["key"]
    if not key.startswith(prefix) or "\\" in key:
        raise RuntimeError(f"Unexpected file path from NASA: {key}")

    relative = PurePosixPath(key[len(prefix) :])
    if relative.is_absolute() or any(
        part in ("", ".", "..") for part in relative.parts
    ):
        raise RuntimeError(f"Unsafe file path from NASA: {key}")
    return relative


def format_size(size: int) -> str:
    return f"{size / (1024**3):.2f} GiB"


def ensure_download_gitignore(output_dir: Path) -> None:
    ignore_file = output_dir / ".gitignore"
    content = (
        ignore_file.read_text(encoding="utf-8")
        if ignore_file.exists()
        else ""
    )
    if all(rule in content.splitlines() for rule in DOWNLOAD_IGNORE_RULES.splitlines()):
        return

    separator = "" if not content or content.endswith("\n") else "\n"
    with ignore_file.open("a", encoding="utf-8", newline="\n") as stream:
        stream.write(
            f"{separator}\n# Ignore downloaded PSI data\n{DOWNLOAD_IGNORE_RULES}"
        )


def get_download_url(
    file_record: dict, study_version: int, psi_id: str
) -> str:
    query = urlencode(
        {
            "file": file_record["id"],
            "version": file_record["version"],
            "studyVersion": study_version,
            "redirect": "false",
        }
    )
    response = api_request(
        f"{API_ROOT}/studies/{psi_id}/download?{query}", psi_id
    ).decode("utf-8").strip()
    parsed = urlparse(response)
    if parsed.scheme != "https" or not parsed.netloc:
        raise RuntimeError(
            f"NASA did not return a valid download URL for {file_record['key']}."
        )
    return response


def download_file(
    file_record: dict, study_version: int, output_dir: Path, psi_id: str
) -> str:
    relative = relative_path(file_record, psi_id)
    destination = output_dir.joinpath(*relative.parts)
    expected_size = file_record["bytes_size"]
    if destination.is_file() and destination.stat().st_size == expected_size:
        return "skipped"

    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".part")

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            signed_url = get_download_url(file_record, study_version, psi_id)
            request = Request(signed_url, headers={"User-Agent": USER_AGENT})
            received = 0
            next_report = 64 * 1024 * 1024
            with urlopen(request, timeout=120) as response:
                with partial.open("wb") as stream:
                    while True:
                        chunk = response.read(CHUNK_SIZE)
                        if not chunk:
                            break
                        stream.write(chunk)
                        received += len(chunk)
                        if received >= next_report:
                            print(
                                f"  {format_size(received)} received",
                                end="\r",
                                flush=True,
                            )
                            next_report += 64 * 1024 * 1024

            if received != expected_size:
                raise RuntimeError(
                    f"size mismatch (expected {expected_size} bytes, "
                    f"received {received})"
                )
            os.replace(partial, destination)
            if received >= 64 * 1024 * 1024:
                print(" " * 40, end="\r")
            return "downloaded"
        except (HTTPException, HTTPError, URLError, OSError, RuntimeError) as exc:
            if partial.exists():
                partial.unlink()
            if attempt == MAX_ATTEMPTS:
                raise RuntimeError(
                    f"Could not download {file_record['key']}: {exc}"
                ) from exc
            print(f"  Attempt {attempt} failed ({exc}); retrying in {2**attempt}s.")
            time.sleep(2**attempt)

    raise RuntimeError(f"Could not download {file_record['key']}.")


def download_psi_files(
    psi_id: str,
    output_dir: Path | None = None,
    list_only: bool = False,
) -> int:
    psi_id = validate_psi_id(psi_id)
    study_version, branches = get_file_listing(psi_id)
    summaries = []
    for name, files in branches:
        public_files = [
            item
            for item in files
            if not item.get("restricted") and not item.get("restrictedAccess")
        ]
        restricted_count = len(files) - len(public_files)
        size = sum(item["bytes_size"] for item in public_files)
        summaries.append(
            {
                "name": name,
                "files": public_files,
                "restricted_count": restricted_count,
                "size": size,
            }
        )

    output_dir = output_dir or Path("downloads") / psi_id
    print(f"{psi_id} study version {study_version}:")
    print(f"Destination: {output_dir.resolve()}")
    for branch in summaries:
        print(
            f"- {branch['name']}: {len(branch['files'])} public file(s), "
            f"{format_size(branch['size'])}"
            + (
                f"; {branch['restricted_count']} restricted"
                if branch["restricted_count"]
                else ""
            )
        )

    if list_only:
        for branch in summaries:
            for item in branch["files"]:
                print(
                    f"{relative_path(item, psi_id)} ({item['bytes_size']:,} bytes)"
                )
        return 0

    selected = []
    for branch in summaries:
        if not branch["files"]:
            if branch["restricted_count"]:
                print(f"Skipping {branch['name']}: files are restricted.")
            continue
        while True:
            try:
                answer = input(
                    f"Download '{branch['name']}' "
                    f"({len(branch['files'])} files, "
                    f"{format_size(branch['size'])})? [y/n]: "
                ).strip().lower()
            except EOFError:
                answer = "n"
            if answer in ("y", "yes"):
                selected.append(branch)
                break
            if answer in ("n", "no", ""):
                break
            print("Please answer y or n.")

    if not selected:
        print("No branches selected; nothing was downloaded.")
        return 0

    selected_files = [
        item for branch in selected for item in branch["files"]
    ]
    total_size = sum(item["bytes_size"] for item in selected_files)
    print(
        f"Downloading {len(selected_files)} file(s) from "
        f"{len(selected)} branch(es), {format_size(total_size)} total."
    )

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    ensure_download_gitignore(output_dir)
    downloaded = 0
    skipped = 0
    failures = []
    for branch in selected:
        print(f"Branch: {branch['name']}")
        for index, item in enumerate(branch["files"], start=1):
            name = str(relative_path(item, psi_id))
            print(
                f"[{index}/{len(branch['files'])}] {name} "
                f"({item['bytes_size']:,} bytes)"
            )
            try:
                result = download_file(item, study_version, output_dir, psi_id)
                if result == "skipped":
                    skipped += 1
                    print("  Already present; skipping.")
                else:
                    downloaded += 1
                    print("  Complete.")
            except (HTTPException, HTTPError, URLError, OSError, RuntimeError) as exc:
                failures.append((name, str(exc)))
                print(f"  Failed: {exc}", file=sys.stderr)

    print(
        f"Finished: {downloaded} downloaded, {skipped} already present, "
        f"{len(failures)} failed."
    )
    if failures:
        print("Failed files:", file=sys.stderr)
        for name, error in failures:
            print(f"  {name}: {error}", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Choose which public branches to download from a NASA PSI investigation."
    )
    parser.add_argument(
        "--psi-id",
        default=DEFAULT_PSI_ID,
        help=f"investigation ID (default: {DEFAULT_PSI_ID})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="destination directory (default: ./downloads/<PSI-ID>)",
    )
    parser.add_argument(
        "--list-only",
        action="store_true",
        help="show branch sizes and files without prompting or downloading",
    )
    args = parser.parse_args(argv)

    try:
        return download_psi_files(
            psi_id=args.psi_id,
            output_dir=args.output,
            list_only=args.list_only,
        )
    except (RuntimeError, ValueError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
