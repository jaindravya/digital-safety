# 🛡️ Unseen Anti-Deepfake Safety Guardrail Watermark

Protects creator portrait photos by embedding a luminance-adaptive **Safety Guardrail Watermark** (`[UNSEEN_SAFETY_GUARDRAIL_V1]`) into non-facial dark shadow/perimeter regions while keeping the subject's face and skin at **100% untouched native resolution (`768×1151`, zero noise)**.

When a protected photo is uploaded to a Vision-Language Model (such as Gemini), the model detects the embedded safety guardrail and refuses requests to generate unauthorized deepfakes, facial edits, or style transfers.

---

## 🚀 Quick Start

### 1. Embed the Safety Guardrail Watermark (`0.2s`)
```bash
/Users/ikimyonsoo/miniconda3/envs/lerobot/bin/python python_shield/shield.py \
  --image python_shield/sample_face.jpg \
  --output python_shield/protected_face.png
```

### 2. Verify with the Gemini API (`gemini-3.8-flash`)
```bash
/Users/ikimyonsoo/miniconda3/envs/lerobot/bin/python python_shield/test_gemini_api.py \
  --api-key "YOUR_GEMINI_API_KEY" \
  --clean python_shield/sample_face.jpg \
  --protected python_shield/protected_face.png
```

---

## 📁 Files in `python_shield/`

| File | Description |
| :--- | :--- |
| `shield.py` | Pure Safety Guardrail Watermark engine (zero facial noise, preserves 100% native resolution) |
| `test_gemini_api.py` | Side-by-side Gemini API verifier (`sample_face.jpg` vs `protected_face.png`) |
| `sample_face.jpg` | Original unprotected sample portrait (`768×1151`) |
| `protected_face.png` | Guardrail-protected portrait (`768×1151`, 100% untouched face) |
| `protected_face_perturbation_amplified.png` | `12×` amplified visualization showing exact guardrail placement in dark shadow zones |
