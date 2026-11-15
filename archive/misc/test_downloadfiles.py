import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError

import downloadfiles


class DownloadDestinationTests(unittest.TestCase):
    def test_parses_r2_destination(self):
        self.assertEqual(
            downloadfiles.parse_destination("r2://space-data/psi-archive"),
            ("r2", ("space-data", "psi-archive")),
        )

    def test_rejects_r2_path_traversal(self):
        with self.assertRaises(ValueError):
            downloadfiles.parse_destination("r2://space-data/../private")

    def test_reads_full_r2_chunks_from_short_reads(self):
        class ShortReader(io.BytesIO):
            def read(self, size=-1):
                return super().read(min(size, 2))

        stream = ShortReader(b"abcdefgh")
        self.assertEqual(downloadfiles.read_stream_chunk(stream, 5), b"abcde")
        self.assertEqual(downloadfiles.read_stream_chunk(stream, 5), b"fgh")

    def test_other_prompt_uses_custom_local_folder_and_n_skips_next_branch(self):
        record = {
            "bytes_size": 5,
            "id": "file-1",
            "key": "psi-data/PSI-26/Presentations/talk.pdf",
            "version": 1,
        }
        branches = [
            ("Presentations", [record]),
            (
                "Raw Data",
                [
                    {
                        **record,
                        "key": "psi-data/PSI-26/Raw Data/data.bin",
                        "id": "file-2",
                    }
                ],
            ),
        ]
        with tempfile.TemporaryDirectory() as temp:
            custom_path = str(Path(temp) / "custom")
            answers = iter(("other", custom_path, "n"))
            with (
                patch.object(
                    downloadfiles,
                    "get_file_listing",
                    return_value=(4, branches),
                ),
                patch.object(downloadfiles, "download_file", return_value="downloaded") as download,
                patch("builtins.input", side_effect=lambda _: next(answers)),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                result = downloadfiles.download_psi_files("PSI-26")

            self.assertEqual(result, 0)
            download.assert_called_once()
            self.assertEqual(download.call_args.args[2], Path(custom_path))
            self.assertTrue((Path(custom_path) / ".gitignore").is_file())

    def test_other_r2_destination_does_not_create_local_downloads(self):
        record = {
            "bytes_size": 5,
            "id": "file-1",
            "key": "psi-data/PSI-26/Presentations/talk.pdf",
            "version": 1,
        }
        with tempfile.TemporaryDirectory() as temp:
            local_path = Path(temp) / "local"
            with (
                patch.object(
                    downloadfiles,
                    "get_file_listing",
                    return_value=(4, [("Presentations", [record])]),
                ),
                patch.object(downloadfiles, "create_r2_client", return_value=Mock()),
                patch.object(
                    downloadfiles, "download_file_to_r2", return_value="uploaded"
                ) as upload,
                patch("builtins.input", side_effect=("other", "r2://space-data/archive")),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                result = downloadfiles.download_psi_files(
                    "PSI-26", output_dir=local_path
                )

            self.assertEqual(result, 0)
            self.assertFalse(local_path.exists())
            upload.assert_called_once()
            self.assertEqual(upload.call_args.args[3:5], ("space-data", "archive"))

    def test_streams_r2_upload_without_local_file(self):
        client = Mock()
        client.head_object.side_effect = ClientError(
            {
                "Error": {"Code": "404", "Message": "Not Found"},
                "ResponseMetadata": {"HTTPStatusCode": 404},
            },
            "HeadObject",
        )
        client.create_multipart_upload.return_value = {"UploadId": "upload-1"}
        client.upload_part.return_value = {"ETag": '"etag-1"'}
        record = {
            "bytes_size": 5,
            "id": "file-1",
            "key": "psi-data/PSI-26/Presentations/talk.pdf",
            "version": 1,
        }

        with (
            patch.object(downloadfiles, "get_download_url", return_value="https://nasa.test/file"),
            patch.object(downloadfiles, "urlopen", return_value=io.BytesIO(b"hello")),
        ):
            result = downloadfiles.download_file_to_r2(
                record, 4, "PSI-26", "space-data", "archive", client
            )

        self.assertEqual(result, "uploaded")
        client.upload_part.assert_called_once()
        self.assertEqual(client.upload_part.call_args.kwargs["Body"], b"hello")
        self.assertEqual(
            client.complete_multipart_upload.call_args.kwargs["Key"],
            "archive/PSI-26/Presentations/talk.pdf",
        )
        client.abort_multipart_upload.assert_not_called()


if __name__ == "__main__":
    unittest.main()
