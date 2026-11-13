"""
Download a sample portrait image for testing anti-deepfake cloaking.
"""

import urllib.request
import os
import sys

SAMPLE_URL = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=768&q=80"
FALLBACK_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Pierre-Person.jpg/800px-Pierre-Person.jpg"

def download_sample(dest_path="sample_face.jpg"):
    print(f"Downloading sample portrait to {dest_path}...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    try:
        req = urllib.request.Request(SAMPLE_URL, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as response, open(dest_path, 'wb') as out_file:
            out_file.write(response.read())
        print(f"[OK] Downloaded sample image to {dest_path}")
        return True
    except Exception as e:
        print(f"Primary URL failed ({e}), trying fallback...")
        try:
            req = urllib.request.Request(FALLBACK_URL, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as response, open(dest_path, 'wb') as out_file:
                out_file.write(response.read())
            print(f"[OK] Downloaded fallback sample image to {dest_path}")
            return True
        except Exception as e2:
            print(f"Fallback failed: {e2}")
            return False

if __name__ == "__main__":
    dest = sys.argv[1] if len(sys.argv) > 1 else "sample_face.jpg"
    download_sample(dest)
