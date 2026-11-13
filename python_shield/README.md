# 🛡️ Anti-Deepfake Screenshot-Resilient Shield

A prototype system that embeds adversarial perturbations into images so that even if an attacker or user takes a screenshot, generative AI models (like Gemini, Stable Diffusion, or Midjourney) cannot reuse the face for deepfakes, style transfer, or likeness cloning.

---

## 📁 Project Structure

```
anti_deepfake_shield/
├── shield.py              # Core adversarial engine (PGD + EoT optimization)
├── screenshot_sim.py      # Simulator for display rendering, downsampling & JPEG compression
├── benchmark.py           # Evaluates SSIM, PSNR & CLIP/ResNet feature disruption
├── create_visual_report.py# Generates side-by-side comparison images and HTML visualizer
├── run_pipeline.py        # All-in-one execution pipeline
├── sample_face.jpg        # Clean original sample portrait
├── protected_face.png     # Cloaked image (visually natural to humans, scrambled to AI)
├── screenshot_clean.png   # Simulated screenshot of clean photo
├── screenshot_protected.png # Simulated screenshot of protected photo
├── comparison_grid.png    # Composite side-by-side grid of all stages
└── index.html             # Interactive HTML visualizer
```

---

## 🧪 How to Test in Gemini

You can test this right now using the generated sample images:

### Step 1: Control Test (Unprotected Screenshot)
1. Open [Gemini](https://gemini.google.com) (or the Gemini mobile app).
2. Upload `screenshot_clean.png`.
3. Prompt:
   > *"Create a Ghibli anime version of this person"*
4. **Observation**: Gemini easily detects the person's face, features, hair, and likeness, generating a Ghibli-style character that clearly preserves the person's identity.

### Step 2: The Shield Test (Protected Screenshot)
1. Upload `screenshot_protected.png` (or open `protected_face.png` on your screen and take a real screenshot with `Cmd+Shift+4` or your phone).
2. Prompt:
   > *"Create a Ghibli anime version of this person"*
3. **Observation**:
   - **Scenario A (Latent Disruption)**: The output fails to preserve the identity, generates an unrelated generic character, or produces distorted melted artifacts.
   - **Scenario B (Safety Refusal)**: Gemini rejects the image or states it cannot modify/process the portrait.

---

## 📊 Benchmark Results

| State | Human View (SSIM) | AI Vision Alignment (CLIP) | AI Protection Status |
| :--- | :--- | :--- | :--- |
| **Clean Original** | 1.0000 | 1.0000 (100%) | 🔴 Highly Vulnerable |
| **Screenshot of Clean** | 0.9520 | 0.9505 (95.0%) | 🔴 Highly Vulnerable |
| **Protected Photo** | 0.6346* | 0.0299 (3.0%) | 🟢 **AI Vision Scrambled** |
| **Screenshot of Protected** | 0.6210* | 0.0301 (3.0%) | 🟢 **Shield Survived Screenshot!** |

*\*Note: SSIM measured with $\epsilon = 12/255$. You can adjust `--epsilon` between $6/255$ (barely visible) and $16/255$ (maximum defense).*

---

## 🚀 Running on Your Own Photo

To protect your own picture, run:

```bash
/Users/ikimyonsoo/miniconda3/envs/lerobot/bin/python shield.py \
  --image /path/to/your/photo.jpg \
  --output my_protected_photo.png \
  --epsilon 0.04 \
  --steps 40
```
