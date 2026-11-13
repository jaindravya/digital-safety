"""
End-to-End Anti-Deepfake Shield Pipeline
----------------------------------------
Runs:
1. Shield generation with EoT
2. Realistic Screenshot Simulation (clean vs protected)
3. Quantitative Benchmark (SSIM, PSNR, Cosine Disruption)
4. Visual comparison artifact generation
"""

import os
import sys
import argparse
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def run_cmd(cmd):
    print(f"\n[RUNNING] {cmd}")
    res = subprocess.run(cmd, shell=True)
    if res.returncode != 0:
        print(f"Command failed with code {res.returncode}")
        sys.exit(res.returncode)

def main():
    parser = argparse.ArgumentParser(description="Run complete anti-deepfake shield demo.")
    parser.add_argument("--image", default=None, help="Input portrait image path (optional)")
    parser.add_argument("--epsilon", type=float, default=12.0/255.0, help="Perturbation budget (default 12/255)")
    parser.add_argument("--steps", type=int, default=80, help="Optimization steps (default 80)")
    args = parser.parse_args()

    python_bin = sys.executable

    # 1. Determine input image
    if args.image and os.path.exists(args.image):
        input_image = os.path.abspath(args.image)
    else:
        sample_path = os.path.join(SCRIPT_DIR, "sample_face.jpg")
        if not os.path.exists(sample_path):
            print("No input image specified and sample_face.jpg not found. Please provide an image with --image.")
            sys.exit(1)
        input_image = sample_path

    protected_image = os.path.join(SCRIPT_DIR, "protected_face.png")
    screenshot_clean = os.path.join(SCRIPT_DIR, "screenshot_clean.png")
    screenshot_protected = os.path.join(SCRIPT_DIR, "screenshot_protected.png")

    print("==================================================")
    print("      ANTI-DEEPFAKE SHIELD DEMO PIPELINE          ")
    print("==================================================")
    print(f"Input image: {input_image}")
    print(f"Budget (epsilon): {args.epsilon:.4f} ({int(args.epsilon * 255)}/255)")
    print(f"Steps: {args.steps}")

    # Step 1: Shield Generation
    shield_script = os.path.join(SCRIPT_DIR, "shield.py")
    cmd_shield = f'"{python_bin}" "{shield_script}" --image "{input_image}" --output "{protected_image}" --epsilon {args.epsilon} --steps {args.steps}'
    run_cmd(cmd_shield)

    # Step 2: Screenshot Simulation
    sim_script = os.path.join(SCRIPT_DIR, "screenshot_sim.py")
    cmd_sim_clean = f'"{python_bin}" "{sim_script}" --input "{input_image}" --output "{screenshot_clean}"'
    cmd_sim_prot = f'"{python_bin}" "{sim_script}" --input "{protected_image}" --output "{screenshot_protected}"'
    run_cmd(cmd_sim_clean)
    run_cmd(cmd_sim_prot)

    # Step 3: Benchmarking
    bench_script = os.path.join(SCRIPT_DIR, "benchmark.py")
    cmd_bench = f'"{python_bin}" "{bench_script}" --clean "{input_image}" --protected "{protected_image}" --sc_clean "{screenshot_clean}" --sc_protected "{screenshot_protected}"'
    run_cmd(cmd_bench)

    print("\n==================================================")
    print("DEMO COMPLETE!")
    print("Test artifacts ready:")
    print(f"1. Original Photo:                 {input_image}")
    print(f"2. Protected Photo:                {protected_image}")
    print(f"3. Screenshot of Original:         {screenshot_clean}")
    print(f"4. Screenshot of Protected Photo:  {screenshot_protected}")
    print("==================================================")

if __name__ == "__main__":
    main()
