#!/usr/bin/env bash
set -euo pipefail

ids=${1:?comma-separated case ids are required}
sudo apt-get update
sudo apt-get install -y ffmpeg espeak-ng
python -m pip install -r site/narration-requirements.txt
node site/scripts/build-kokoro-jobs.mjs --case "$ids" --output .narration-jobs
for job in .narration-jobs/*.json; do
  python site/scripts/generate-kokoro-clips.py "$job" narration-clips
done
