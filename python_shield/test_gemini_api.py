"""
Hackathon Gemini API Tester for Anti-Deepfake Shield
----------------------------------------------------
Uses your Gemini API key (via standard REST API — zero extra SDK installs required)
to test how Gemini responds to the clean vs. protected screenshot.

Usage:
  export GEMINI_API_KEY="your-api-key-here"
  python test_gemini_api.py
or:
  python test_gemini_api.py --api-key "your-api-key-here"
"""

import argparse
import base64
import json
import os
import sys
import urllib.request
import urllib.error


def call_gemini_vision(
    api_key: str,
    image_path: str,
    prompt: str,
    model: str = "gemini-3.8-flash",
    save_image_prefix: str = None
):
    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode("utf-8")

    mime_type = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": img_b64
                        }
                    }
                ]
            }
        ]
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidates = data.get("candidates", [])
            if not candidates:
                return f"[BLOCKED / NO CANDIDATES]: {json.dumps(data.get('promptFeedback', {}), indent=2)}"
            finish_reason = candidates[0].get("finishReason", "UNKNOWN")
            parts = candidates[0].get("content", {}).get("parts", [])
            texts = [p.get("text", "") for p in parts if "text" in p and not p.get("thought", False)]
            saved_files = []
            for idx, p in enumerate(parts):
                inline = p.get("inlineData") or p.get("inline_data")
                if inline and "data" in inline and save_image_prefix:
                    out_path = f"{save_image_prefix}_{idx}.png"
                    with open(out_path, "wb") as out_f:
                        out_f.write(base64.b64decode(inline["data"]))
                    saved_files.append(out_path)
            saved_msg = f" | Saved images: {saved_files}" if saved_files else ""
            return f"[FinishReason: {finish_reason}{saved_msg}]\n" + "\n".join(texts).strip()
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        return f"[HTTP Error {e.code}]: {err_body}"
    except Exception as e:
        return f"[Request Error]: {e}"


def main():
    parser = argparse.ArgumentParser(description="Test Clean vs Protected Screenshots against the Gemini API.")
    parser.add_argument("--api-key", type=str, default=os.environ.get("GEMINI_API_KEY"), help="Your Gemini API Key")
    parser.add_argument("--clean", type=str, default="screenshot_clean.png", help="Clean screenshot path")
    parser.add_argument("--protected", type=str, default="screenshot_protected.png", help="Protected screenshot path")
    parser.add_argument("--model", type=str, default="gemini-3.8-flash", help="Gemini model name (default: gemini-3.8-flash)")
    parser.add_argument(
        "--prompt",
        type=str,
        default="Create a Studio Ghibli version of this person, and describe the exact facial features and identity you see in the image.",
        help="Prompt to test"
    )
    args = parser.parse_args()

    if not args.api_key:
        print("Error: Please provide your API key via --api-key YOUR_KEY or export GEMINI_API_KEY=YOUR_KEY")
        sys.exit(1)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    clean_path = args.clean if os.path.exists(args.clean) else os.path.join(base_dir, args.clean)
    prot_path = args.protected if os.path.exists(args.protected) else os.path.join(base_dir, args.protected)

    print("=======================================================")
    print(f"Testing Gemini API ({args.model})")
    print(f"Prompt: {args.prompt}")
    print("=======================================================\n")

    print(f"--- 1. Testing Clean Screenshot ({os.path.basename(clean_path)}) ---")
    res_clean = call_gemini_vision(
        args.api_key,
        clean_path,
        args.prompt,
        args.model,
        save_image_prefix=os.path.join(base_dir, "gemini_output_clean")
    )
    print(res_clean)

    print(f"\n--- 2. Testing Protected Screenshot ({os.path.basename(prot_path)}) ---")
    res_prot = call_gemini_vision(
        args.api_key,
        prot_path,
        args.prompt,
        args.model,
        save_image_prefix=os.path.join(base_dir, "gemini_output_protected")
    )
    print(res_prot)
    print("\n=======================================================")


if __name__ == "__main__":
    main()
