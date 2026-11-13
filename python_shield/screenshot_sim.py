"""
Screenshot Simulator
--------------------
Simulates realistic screenshotting pipeline:
1. Display rendering & fractional scaling (e.g. Retina / mobile screen fitting)
2. Subpixel interpolation / anti-aliasing
3. Color space / gamma curve transformation
4. Slight random crop (simulating user cropping phone status bars / UI)
5. Re-encoding to JPEG/PNG with standard compression
"""

import argparse
import os
import sys
from PIL import Image, ImageEnhance
import io

def simulate_screenshot(
    input_path: str,
    output_path: str,
    scale_factor: float = 0.93,
    crop_percent: float = 0.03,
    jpeg_quality: int = 88
):
    """
    Applies the degradation typical of a mobile / desktop screenshot.
    """
    img = Image.open(input_path).convert("RGB")
    w, h = img.size
    
    # 1. Simulating cropping (user cropping phone screenshot or app UI borders)
    crop_x = int(w * crop_percent)
    crop_y = int(h * crop_percent)
    cropped = img.crop((crop_x, crop_y, w - crop_x, h - crop_y))
    
    # 2. Rescaling with bilinear / bicubic filtering (display rendering)
    new_w = int(cropped.size[0] * scale_factor)
    new_h = int(cropped.size[1] * scale_factor)
    rescaled = cropped.resize((new_w, new_h), Image.Resampling.BILINEAR)
    
    # 3. Slight display gamma & contrast shift (Display P3 to sRGB screen calibration)
    enhancer = ImageEnhance.Color(rescaled)
    rescaled = enhancer.enhance(0.98)
    contrast = ImageEnhance.Contrast(rescaled)
    rescaled = contrast.enhance(1.02)
    
    # 4. Save through lossy buffer to simulate OS screenshot compression & messaging app recompression
    buffer = io.BytesIO()
    rescaled.save(buffer, format="JPEG", quality=jpeg_quality)
    buffer.seek(0)
    
    result = Image.open(buffer)
    result.save(output_path, format="PNG")
    print(f"[OK] Simulated screenshot saved to: {output_path} ({new_w}x{new_h})")
    return output_path

def main():
    parser = argparse.ArgumentParser(description="Simulate screenshot capture on an image.")
    parser.add_argument("--input", type=str, required=True, help="Path to input image")
    parser.add_argument("--output", type=str, required=True, help="Path to save simulated screenshot")
    parser.add_argument("--quality", type=int, default=88, help="JPEG compression quality (default: 88)")
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"Error: {args.input} not found.")
        sys.exit(1)
        
    simulate_screenshot(args.input, args.output, jpeg_quality=args.quality)

if __name__ == "__main__":
    main()
