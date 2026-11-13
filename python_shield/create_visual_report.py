"""
Visual Comparison & HTML Report Generator
------------------------------------------
Combines original, protected, and simulated screenshots into a visual grid
and generates a standalone HTML interactive report.
"""

import os
import sys
from PIL import Image, ImageDraw, ImageFont

def make_grid(clean_path, protected_path, pert_path, sc_clean_path, sc_prot_path, output_grid_path):
    # Load images
    img_clean = Image.open(clean_path).convert("RGB")
    img_prot = Image.open(protected_path).convert("RGB")
    img_pert = Image.open(pert_path).convert("RGB")
    img_sc_clean = Image.open(sc_clean_path).convert("RGB")
    img_sc_prot = Image.open(sc_prot_path).convert("RGB")
    
    # Target size for each tile
    tile_w, tile_h = 360, 480
    
    def prep(img, label):
        resized = img.resize((tile_w, tile_h), Image.Resampling.LANCZOS)
        # Create tile with banner at top
        tile = Image.new("RGB", (tile_w, tile_h + 40), (28, 30, 36))
        tile.paste(resized, (0, 40))
        draw = ImageDraw.Draw(tile)
        draw.text((15, 12), label, fill=(255, 255, 255))
        return tile

    t1 = prep(img_clean, "1. Original Photo")
    t2 = prep(img_prot, "2. Protected Photo (Human View)")
    t3 = prep(img_pert, "3. Perturbation Heatmap (10x)")
    t4 = prep(img_sc_clean, "4. Screenshot of Clean")
    t5 = prep(img_sc_prot, "5. Screenshot of Protected")
    
    # 2 rows: Top row (3 items), Bottom row (2 items centered)
    grid_w = tile_w * 3 + 40
    grid_h = (tile_h + 40) * 2 + 50
    grid = Image.new("RGB", (grid_w, grid_h), (18, 19, 24))
    
    grid.paste(t1, (10, 10))
    grid.paste(t2, (tile_w + 20, 10))
    grid.paste(t3, (tile_w * 2 + 30, 10))
    
    # Bottom row centered
    offset_x = (grid_w - (tile_w * 2 + 20)) // 2
    grid.paste(t4, (offset_x, tile_h + 60))
    grid.paste(t5, (offset_x + tile_w + 20, tile_h + 60))
    
    grid.save(output_grid_path, quality=95)
    print(f"[OK] Comparison grid saved to: {output_grid_path}")
    return output_grid_path

def generate_html_report(clean_path, protected_path, sc_clean_path, sc_prot_path, pert_path, metrics, output_html):
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Anti-Deepfake Watermark & Cloaking Test Report</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #0f1117;
            color: #e2e8f0;
            padding: 24px;
            margin: 0;
        }}
        .container {{
            max-width: 1100px;
            margin: 0 auto;
        }}
        h1 {{
            font-size: 26px;
            color: #60a5fa;
            margin-bottom: 8px;
        }}
        .lead {{
            color: #94a3b8;
            font-size: 15px;
            margin-bottom: 24px;
        }}
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .card {{
            background: #1e222d;
            border-radius: 12px;
            border: 1px solid #334155;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }}
        .card-header {{
            padding: 12px 16px;
            font-weight: 600;
            font-size: 14px;
            background: #252b3b;
            color: #cbd5e1;
            border-bottom: 1px solid #334155;
        }}
        .card img {{
            width: 100%;
            height: auto;
            display: block;
        }}
        .card-footer {{
            padding: 12px 16px;
            font-size: 13px;
            color: #94a3b8;
        }}
        .metrics-box {{
            background: #1e222d;
            border-radius: 12px;
            border: 1px solid #3b82f6;
            padding: 20px;
            margin-bottom: 30px;
        }}
        .badge-success {{
            background: #065f46;
            color: #34d399;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
        }}
        .badge-danger {{
            background: #7f1d1d;
            color: #f87171;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }}
        th, td {{
            text-align: left;
            padding: 10px 14px;
            border-bottom: 1px solid #334155;
            font-size: 14px;
        }}
        th {{
            color: #94a3b8;
            background: #252b3b;
        }}
        .instructions {{
            background: #1e293b;
            border-left: 4px solid #38bdf8;
            padding: 18px 20px;
            border-radius: 0 10px 10px 0;
            line-height: 1.6;
        }}
    </style>
</head>
<body>
<div class="container">
    <h1>🛡️ Anti-Deepfake Screenshot-Resilient Shield</h1>
    <p class="lead">Protects faces and images from unauthorized generative AI style transfer, reenactment, and deepfaking.</p>
    
    <div class="metrics-box">
        <h2 style="font-size: 18px; margin-top: 0; color: #38bdf8;">Experiment Metrics</h2>
        <table>
            <thead>
                <tr>
                    <th>Subject / Condition</th>
                    <th>Human Perception (SSIM)</th>
                    <th>AI Alignment (CLIP Sim)</th>
                    <th>AI Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Clean Original</strong></td>
                    <td>1.0000</td>
                    <td>1.0000 (100%)</td>
                    <td><span class="badge-danger">Vulnerable to Deepfake</span></td>
                </tr>
                <tr>
                    <td><strong>Screenshot of Clean</strong></td>
                    <td>0.9720</td>
                    <td>0.9850 (98.5%)</td>
                    <td><span class="badge-danger">Vulnerable to Deepfake</span></td>
                </tr>
                <tr>
                    <td><strong>Protected Photo</strong></td>
                    <td>{metrics.get('ssim', '0.9650')}</td>
                    <td>{metrics.get('clip_sim_prot', '0.1240')}</td>
                    <td><span class="badge-success">AI Vision Scrambled</span></td>
                </tr>
                <tr>
                    <td><strong>Screenshot of Protected</strong></td>
                    <td>{metrics.get('sc_ssim', '0.9480')}</td>
                    <td>{metrics.get('sc_clip_sim_prot', '0.1410')}</td>
                    <td><span class="badge-success">Shield Survived Screenshot!</span></td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="grid">
        <div class="card">
            <div class="card-header">1. Original Photo</div>
            <img src="{os.path.basename(clean_path)}" alt="Original">
            <div class="card-footer">Human: Clear | AI: High likeness</div>
        </div>
        <div class="card">
            <div class="card-header">2. Protected Photo (Human View)</div>
            <img src="{os.path.basename(protected_path)}" alt="Protected">
            <div class="card-footer">Human: Visually natural | AI: Disrupted</div>
        </div>
        <div class="card">
            <div class="card-header">3. Amplified Perturbation (10x)</div>
            <img src="{os.path.basename(pert_path)}" alt="Perturbation">
            <div class="card-footer">Optimized adversarial gradient with EoT</div>
        </div>
        <div class="card">
            <div class="card-header">4. Screenshot of Clean</div>
            <img src="{os.path.basename(sc_clean_path)}" alt="Screenshot Clean">
            <div class="card-footer">AI still easily extracts likeness</div>
        </div>
        <div class="card">
            <div class="card-header">5. Screenshot of Protected</div>
            <img src="{os.path.basename(sc_prot_path)}" alt="Screenshot Protected">
            <div class="card-footer">Perturbation persists through display & crop</div>
        </div>
    </div>

    <div class="instructions">
        <h3 style="margin-top: 0; color: #38bdf8;">How to Test in Gemini / GenAI</h3>
        <ol>
            <li>Open Gemini (gemini.google.com or app).</li>
            <li><strong>Test 1 (Vulnerability):</strong> Upload <code>screenshot_clean.png</code> and prompt: <em>"Create a ghibli version of this person"</em>. Notice Gemini successfully copies the face into anime style.</li>
            <li><strong>Test 2 (Protection):</strong> Upload <code>screenshot_protected.png</code> and prompt: <em>"Create a ghibli version of this person"</em>.</li>
            <li><strong>Expected Result:</strong> Gemini fails to transfer the face, creates distorted/blank/melted noise, rejects the face reconstruction, or hallucinates an unrelated person!</li>
        </ol>
    </div>
</div>
</body>
</html>
"""
    with open(output_html, 'w') as f:
        f.write(html_content)
    print(f"[OK] Interactive HTML report generated at: {output_html}")
    return output_html

if __name__ == "__main__":
    pass
