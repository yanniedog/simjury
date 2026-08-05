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


if __name__ == "__main__":
    unittest.main()
