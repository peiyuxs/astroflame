from __future__ import annotations

import argparse
import json
import math
import mimetypes
import os
import re
import sys
import time
from http.client import HTTPException
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode, urlparse
from urllib.request import Request, urlopen


DEFAULT_PSI_ID = "PSI-26"
BASE_URL = "https://psi.nasa.gov"
API_ROOT = f"{BASE_URL}/geode-py/ws"
USER_AGENT = "Mozilla/5.0 (compatible; PSI-26-downloader/1.0)"
CHUNK_SIZE = 1024 * 1024
MAX_ATTEMPTS = 3
DOWNLOAD_IGNORE_RULES = "*\n!.gitignore\n"
R2_PART_SIZE = 64 * 1024 * 1024


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


def parse_destination(value: str) -> tuple[str, Path | tuple[str, str]]:
    value = value.strip()
    parsed = urlparse(value)
    if parsed.scheme.lower() != "r2":
        if not value:
            raise ValueError("Enter a local folder path or r2://bucket/prefix.")
        return "local", Path(value).expanduser().resolve()

    bucket = parsed.netloc
    if (
        not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket)
        or ".." in bucket
        or ".-" in bucket
        or "-." in bucket
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Use an R2 destination like r2://bucket-name/optional-prefix.")

    prefix = unquote(parsed.path).strip("/")
    if "\\" in prefix or any(part in ("", ".", "..") for part in prefix.split("/")):
        if prefix:
            raise ValueError("The R2 prefix cannot contain empty or relative path parts.")
    return "r2", (bucket, prefix)


def create_r2_client():
    try:
        import boto3
        from dotenv import load_dotenv
    except ImportError as exc:
        raise RuntimeError(
            "R2 upload dependencies are missing. Run "
            "'python -m pip install -r misc/requirements.txt'."
        ) from exc

    load_dotenv(Path(__file__).with_name(".env"), override=False)
    account_id = os.environ.get("CLOUDFLARE_R2_ACCOUNT_ID", "").strip()
    access_key = os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "").strip()
    if not re.fullmatch(r"[a-fA-F0-9]{32}", account_id):
        raise RuntimeError("CLOUDFLARE_R2_ACCOUNT_ID must be a 32-character account ID.")
    if not access_key or not secret_key:
        raise RuntimeError(
            "R2 upload needs CLOUDFLARE_R2_ACCESS_KEY_ID and "
            "CLOUDFLARE_R2_SECRET_ACCESS_KEY in misc/.env. "
            "Copy misc/.env.example and fill in your local credentials."
        )

    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )


def r2_object_key(
    bucket_prefix: str, psi_id: str, file_record: dict
) -> str:
    relative = relative_path(file_record, psi_id)
    parts = [part for part in (bucket_prefix, psi_id) if part]
    return "/".join((*parts, *relative.parts))


def read_stream_chunk(stream, chunk_size: int) -> bytes:
    chunks = []
    received = 0
    while received < chunk_size:
        chunk = stream.read(chunk_size - received)
        if not chunk:
            break
        chunks.append(chunk)
        received += len(chunk)
    return b"".join(chunks)


def download_file_to_r2(
    file_record: dict,
    study_version: int,
    psi_id: str,
    bucket: str,
    prefix: str,
    client,
) -> str:
    from botocore.exceptions import BotoCoreError, ClientError

    key = r2_object_key(prefix, psi_id, file_record)
    expected_size = file_record["bytes_size"]
    metadata = {
        "psi-file-id": str(file_record["id"]),
        "psi-file-version": str(file_record["version"]),
        "psi-study-version": str(study_version),
    }

    try:
        existing = client.head_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code not in ("404", "NoSuchKey", "NotFound"):
            raise RuntimeError(
                f"Could not check existing R2 object r2://{bucket}/{key}: {exc}"
            ) from exc
    except BotoCoreError as exc:
        raise RuntimeError(
            f"Could not check existing R2 object r2://{bucket}/{key}: {exc}"
        ) from exc
    else:
        if (
            existing.get("ContentLength") == expected_size
            and existing.get("Metadata", {}) == metadata
        ):
            return "skipped"

    content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    for attempt in range(1, MAX_ATTEMPTS + 1):
        upload_id = None
        try:
            signed_url = get_download_url(file_record, study_version, psi_id)
            request = Request(signed_url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=120) as response:
                if expected_size == 0:
                    if response.read(1):
                        raise RuntimeError("NASA file size did not match its listing.")
                    client.put_object(
                        Bucket=bucket,
                        Key=key,
                        Body=b"",
                        ContentType=content_type,
                        Metadata=metadata,
                    )
                    return "uploaded"

                upload = client.create_multipart_upload(
                    Bucket=bucket,
                    Key=key,
                    ContentType=content_type,
                    Metadata=metadata,
                )
                upload_id = upload["UploadId"]
                parts = []
                received = 0
                part_number = 1
                while True:
                    chunk = read_stream_chunk(response, R2_PART_SIZE)
                    if not chunk:
                        break
                    if received + len(chunk) > expected_size:
                        raise RuntimeError(
                            "NASA returned more data than the listed file size."
                        )
                    part = client.upload_part(
                        Bucket=bucket,
                        Key=key,
                        UploadId=upload_id,
                        PartNumber=part_number,
                        Body=chunk,
                    )
                    parts.append(
                        {"PartNumber": part_number, "ETag": part["ETag"]}
                    )
                    received += len(chunk)
                    part_number += 1
                    if received >= R2_PART_SIZE:
                        print(
                            f"  {format_size(received)} streamed to R2",
                            end="\r",
                            flush=True,
                        )

            if received != expected_size:
                raise RuntimeError(
                    f"size mismatch (expected {expected_size} bytes, "
                    f"received {received})"
                )
            client.complete_multipart_upload(
                Bucket=bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )
            upload_id = None
            if received >= R2_PART_SIZE:
                print(" " * 48, end="\r")
            return "uploaded"
        except (
            BotoCoreError,
            ClientError,
            HTTPException,
            HTTPError,
            URLError,
            OSError,
            RuntimeError,
        ) as exc:
            if upload_id:
                client.abort_multipart_upload(
                    Bucket=bucket, Key=key, UploadId=upload_id
                )
            if attempt == MAX_ATTEMPTS:
                raise RuntimeError(
                    f"Could not stream {file_record['key']} to "
                    f"r2://{bucket}/{key}: {exc}"
                ) from exc
            print(f"  Attempt {attempt} failed ({exc}); retrying in {2**attempt}s.")
            time.sleep(2**attempt)

    raise RuntimeError(f"Could not stream {file_record['key']} to R2.")


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

    selected: list[tuple[dict, str, Path | tuple[str, str]]] = []
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
                    f"{format_size(branch['size'])})? [y/n/other]: "
                ).strip().lower()
            except EOFError:
                answer = "n"
            if answer in ("y", "yes"):
                selected.append((branch, "local", output_dir.resolve()))
                break
            if answer in ("n", "no", ""):
                break
            if answer in ("o", "other"):
                while True:
                    try:
                        destination_input = input(
                            "Enter a local folder path or "
                            "r2://bucket-name/optional-prefix: "
                        )
                    except EOFError:
                        print("No destination entered; skipping this branch.")
                        break
                    try:
                        destination_kind, destination_value = parse_destination(
                            destination_input
                        )
                    except ValueError as exc:
                        print(exc)
                        continue
                    selected.append(
                        (branch, destination_kind, destination_value)
                    )
                    break
                break
            print("Please answer y, n, or other.")

    if not selected:
        print("No branches selected; nothing was downloaded.")
        return 0

    selected_files = [
        item for branch, _, _ in selected for item in branch["files"]
    ]
    total_size = sum(item["bytes_size"] for item in selected_files)
    print(
        f"Downloading {len(selected_files)} file(s) from "
        f"{len(selected)} branch(es), {format_size(total_size)} total."
    )

    if any(kind == "r2" for _, kind, _ in selected):
        r2_client = create_r2_client()
    else:
        r2_client = None

    downloaded = 0
    skipped = 0
    failures = []
    for branch, destination_kind, destination in selected:
        print(f"Branch: {branch['name']}")
        if destination_kind == "local":
            if not isinstance(destination, Path):
                raise RuntimeError("Invalid local download destination.")
            print(f"Destination: {destination}")
            destination.mkdir(parents=True, exist_ok=True)
            ensure_download_gitignore(destination)
        else:
            if not isinstance(destination, tuple) or r2_client is None:
                raise RuntimeError("Invalid Cloudflare R2 destination.")
            bucket, prefix = destination
            destination_summary = f"r2://{bucket}/{prefix}".rstrip("/")
            print(f"Destination: {destination_summary}")

        for index, item in enumerate(branch["files"], start=1):
            name = str(relative_path(item, psi_id))
            print(
                f"[{index}/{len(branch['files'])}] {name} "
                f"({item['bytes_size']:,} bytes)"
            )
            try:
                if destination_kind == "local":
                    if not isinstance(destination, Path):
                        raise RuntimeError("Invalid local download destination.")
                    result = download_file(
                        item, study_version, destination, psi_id
                    )
                else:
                    if not isinstance(destination, tuple) or r2_client is None:
                        raise RuntimeError("Invalid Cloudflare R2 destination.")
                    bucket, prefix = destination
                    result = download_file_to_r2(
                        item,
                        study_version,
                        psi_id,
                        bucket,
                        prefix,
                        r2_client,
                    )
                if result == "skipped":
                    skipped += 1
                    print("  Already present and up to date; skipping.")
                else:
                    downloaded += 1
                    print(
                        "  Uploaded to R2."
                        if destination_kind == "r2"
                        else "  Complete."
                    )
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
