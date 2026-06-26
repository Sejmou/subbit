# Subtitle Generation (Incl. Diarization) Through `whisperx`

This folder stores all dependencies required to make subtitle generation from the command line work through `whisperx`.

## Prerequisites

 - `uv` (modern toolbox/package manager for Python)
 - fairly capable PC, ideally with an NVIDIA GPU (supporting CUDA 12.8)

## How to run

Install packages (i.e. `whisperx` and it's PyTorch deps; should auto-install CUDA variants on Linux/Windows)

```bash
uv sync
```
Extract `.wav` from video

```bash
ffmpeg -i your_vid.mp4 -vn -ar 16000 -ac 1 audio.wav
```

Create HuggingFace account, create access token for read access to gated repos (your LLM should be able to assist with specifics) 

Run `whisperx`, passing the created token in `hf_token` (optimized command for German videos, should autoinstall everything)

```bash
uv run whisperx audio.wav   --model large-v3   --language de   --device cuda   --compute_type float16   --batch_size 16   --diarize   --hf_token $HF_TOKEN  --output_dir ./data   --output_format all` and copied over.
```

