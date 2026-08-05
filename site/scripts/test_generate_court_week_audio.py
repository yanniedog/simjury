import importlib.util
import unittest
from pathlib import Path


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


class PauseValidationTests(unittest.TestCase):
    def test_accepts_zero_join_and_normal_authored_pause(self):
        MODULE.validate_job(job_with_pause(0))
        MODULE.validate_job(job_with_pause(340))

    def test_rejects_fractional_and_boolean_pauses(self):
        for invalid in (False, True, 0.5, -0.5, "0"):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(ValueError, "non-integer pause"):
                MODULE.validate_job(job_with_pause(invalid))


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
