import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("generate-court-week-audio.py")
SPEC = importlib.util.spec_from_file_location("court_week_audio", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def job_with_pause(pause):
    return {
        "schema": "simjury.court-week-audio-job/v1",
        "caseId": "cw-0001",
        "sessionId": "cw-0001-monday",
        "sampleRate": 24_000,
        "segments": [
            {
                "opaqueId": f"{index:032x}",
                "cues": [{
                    "id": f"cue-{index}",
                    "text": "Reviewed test words.",
                    "voice": "af_bella",
                    "pauseAfterMs": pause,
                }],
            }
            for index in range(1, 9)
        ],
    }


def v2_job_with_pause(pause):
    return {
        "schema": "simjury.court-week-audio-job/v2",
        "caseId": "cw-0001",
        "sessionId": "cw-0001-monday",
        "sampleRate": 24_000,
        "segments": [
            {
                "opaqueId": f"{index:032x}",
                "captions": [{
                    "id": f"caption-{index}",
                    "sourceCueId": f"source-{index}",
                    "speaker": "Counsel",
                    "text": "Reviewed test words.",
                    "turns": [{
                        "id": f"turn-{index}",
                        "speaker": "Counsel",
                        "text": "Reviewed test words.",
                        "utteranceId": f"utterance-{index}",
                    }],
                }],
                "utterances": [{
                    "id": f"utterance-{index}",
                    "sourceCueId": f"source-{index}",
                    "speaker": "Counsel",
                    "text": "Reviewed test words.",
                    "voice": "af_bella",
                    "tone": "formal",
                    "pauseAfterMs": pause,
                    "parts": [{
                        "captionId": f"caption-{index}",
                        "turnId": f"turn-{index}",
                        "text": "Reviewed test words.",
                    }],
                }],
            }
            for index in range(1, 9)
        ],
    }


class PauseValidationTests(unittest.TestCase):
    def test_accepts_zero_join_and_normal_authored_pause(self):
        for factory in (job_with_pause, v2_job_with_pause):
            MODULE.validate_job(factory(0))
            MODULE.validate_job(factory(340))

    def test_rejects_fractional_and_boolean_pauses(self):
        for factory in (job_with_pause, v2_job_with_pause):
            for invalid in (False, True, 0.5, -0.5, "0"):
                with self.subTest(factory=factory.__name__, invalid=invalid), self.assertRaisesRegex(ValueError, "non-integer pause"):
                    MODULE.validate_job(factory(invalid))

    def test_rejects_unsupported_schemas(self):
        job = job_with_pause(340)
        job["schema"] = "simjury.court-week-audio-job/v3"
        with self.assertRaisesRegex(ValueError, "Unsupported audio job schema"):
            MODULE.validate_job(job)

    def test_v2_caption_and_utterance_coverage_must_match(self):
        job = v2_job_with_pause(340)
        job["segments"][0]["utterances"][0]["parts"][0]["turnId"] = "another-turn"
        with self.assertRaisesRegex(ValueError, "coverage or order differs"):
            MODULE.validate_job(job)


class HuggingFaceDownloadRetryTests(unittest.TestCase):
    def test_retries_transient_xet_server_failure_with_bounded_backoff(self):
        calls = []
        sleeps = []

        def download(**kwargs):
            calls.append(kwargs)
            if len(calls) < 3:
                raise RuntimeError(
                    "CAS service error: Xet reconstruction failed: "
                    "HTTP status server error (500 Internal Server Error)"
                )
            return "/cache/kokoro-v1_0.pth"

        result = MODULE.download_huggingface_asset(
            download,
            MODULE.KOKORO_MODEL,
            sleep=sleeps.append,
        )

        self.assertEqual(result, "/cache/kokoro-v1_0.pth")
        self.assertEqual(len(calls), 3)
        self.assertEqual(sleeps, [5.0, 10.0])
        self.assertTrue(all(call["revision"] == MODULE.KOKORO_REVISION for call in calls))
        self.assertTrue(all(call["repo_id"] == MODULE.KOKORO_REPOSITORY for call in calls))
        self.assertTrue(all(call["filename"] == MODULE.KOKORO_MODEL for call in calls))

    def test_does_not_retry_integrity_failure(self):
        calls = []
        sleeps = []

        def download(**kwargs):
            calls.append(kwargs)
            raise OSError("consistency check failed: checksum mismatch")

        with self.assertRaisesRegex(OSError, "checksum mismatch"):
            MODULE.download_huggingface_asset(
                download,
                MODULE.KOKORO_CONFIG,
                sleep=sleeps.append,
            )

        self.assertEqual(len(calls), 1)
        self.assertEqual(sleeps, [])

    def test_stops_after_bounded_attempts(self):
        calls = []
        sleeps = []

        def download(**kwargs):
            calls.append(kwargs)
            raise TimeoutError("network request timed out")

        with self.assertRaisesRegex(TimeoutError, "timed out"):
            MODULE.download_huggingface_asset(
                download,
                "voices/af_bella.pt",
                sleep=sleeps.append,
            )

        self.assertEqual(len(calls), MODULE.HUGGINGFACE_DOWNLOAD_ATTEMPTS)
        self.assertEqual(sleeps, [5.0, 10.0, 20.0])


class CodecQualityTests(unittest.TestCase):
    def test_uses_release_quality_speech_codecs(self):
        expected = {
            "opus": ["-c:a", "libopus", "-b:a", "64k", "-vbr", "on"],
            "aac": ["-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"],
            "mp3": ["-c:a", "libmp3lame", "-q:a", "2"],
        }
        for codec, codec_arguments in expected.items():
            target = Path(f"output.{codec}")
            with self.subTest(codec=codec), patch.object(MODULE, "run") as run:
                MODULE.encode_once(Path("source.wav"), target, codec, -18.0, -1.5)

                run.assert_called_once()
                command = run.call_args.args[0]
                self.assertEqual(command[-len(codec_arguments) - 1:-1], codec_arguments)
                self.assertEqual(command[-1], str(target))
                self.assertEqual(
                    command[command.index("-af") + 1],
                    "loudnorm=I=-18.0:LRA=7:TP=-1.5",
                )
                self.assertEqual(command[command.index("-ac") + 1], "1")
                self.assertEqual(command[command.index("-ar") + 1], "48000")


class CaptionTimingTests(unittest.TestCase):
    def test_uses_one_continuous_utterance_with_monotonic_caption_boundaries(self):
        first = "Members of the jury panel, switch off every device except the"
        second = "one running this simulation."
        text = f"{first} {second}"
        tokens = []
        cursor = 0
        words = text.split(" ")
        for index, word in enumerate(words):
            piece = word if index == len(words) - 1 else f"{word} "
            tokens.append({
                "text": piece,
                "characterStart": cursor,
                "characterEnd": cursor + len(piece),
                "startSeconds": index * 0.2,
                "endSeconds": index * 0.2 + 0.15,
            })
            cursor += len(piece)

        class Samples:
            size = 4 * 24_000

        parts = [
            {"captionId": "caption-1", "turnId": "turn-1", "text": first},
            {"captionId": "caption-2", "turnId": "turn-2", "text": second},
        ]
        ranges = MODULE.align_utterance_parts(
            {"samples": Samples(), "text": text, "tokens": tokens},
            {"id": "source-1--utterance-1", "text": text, "parts": parts},
            24_000,
        )

        self.assertEqual(ranges[0]["startSeconds"], 0)
        self.assertEqual(ranges[-1]["endSeconds"], 4)
        self.assertEqual(ranges[0]["endSeconds"], ranges[1]["startSeconds"])
        self.assertLess(ranges[0]["startSeconds"], ranges[0]["endSeconds"])
        self.assertLess(ranges[1]["startSeconds"], ranges[1]["endSeconds"])

    def test_fails_closed_when_kokoro_token_text_does_not_match(self):
        class Samples:
            size = 24_000

        with self.assertRaisesRegex(RuntimeError, "does not reconstruct"):
            MODULE.align_utterance_parts(
                {"samples": Samples(), "text": "changed words", "tokens": []},
                {
                    "id": "source-1--utterance-1",
                    "text": "reviewed words",
                    "parts": [{
                        "captionId": "caption-1",
                        "turnId": "turn-1",
                        "text": "reviewed words",
                    }],
                },
                24_000,
            )


if __name__ == "__main__":
    unittest.main()
