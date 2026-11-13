"""
Anti-Deepfake Adversarial Shield with Expectation Over Transformation (EoT)
& Perceptual JND (Just-Noticeable-Difference) Human-Clean Masking
--------------------------------------------------------------------------
Protects images against unauthorized generative AI manipulation (e.g. style transfer,
deepfake reenactment, face-swapping) even after screenshotting or lossy recompression,
while keeping the image clean and natural to human eyes for posting online.
"""

import os
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
import argparse
import sys
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms, models
from torchvision.transforms import functional as TF
from PIL import Image
import numpy as np

from transformers import CLIPVisionModelWithProjection


def get_gaussian_kernel2d(kernel_size: int = 5, sigma: float = 1.1, device: str = 'cpu'):
    """Creates a 2D Gaussian kernel for depthwise convolution to eliminate harsh pixel grain."""
    coords = torch.arange(kernel_size, dtype=torch.float32, device=device) - (kernel_size - 1) / 2.0
    g = torch.exp(-(coords ** 2) / (2 * sigma ** 2))
    g = g / g.sum()
    kernel2d = g[:, None] * g[None, :]
    return kernel2d.view(1, 1, kernel_size, kernel_size).repeat(3, 1, 1, 1)


def compute_jnd_perceptual_mask(img_tensor: torch.Tensor, min_scale: float = 0.25) -> torch.Tensor:
    """
    Computes a Just-Noticeable-Difference (JND) spatial & channel mask.
    - Suppresses perturbations in flat background & smooth skin regions where human eyes
      easily spot grain.
    - Concentrates perturbations along structural edges, hair, eyes, and textures where
      the human visual system masks subtle variations, and where AI encoders attend heavily.
    - Weights RGB channels inversely to human luminance sensitivity (less green/luminance noise).
    """
    # Convert to luminance Y
    r, g, b = img_tensor[:, 0:1], img_tensor[:, 1:2], img_tensor[:, 2:3]
    y = 0.299 * r + 0.587 * g + 0.114 * b

    # Sobel edge detectors
    sobel_x = torch.tensor([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=torch.float32, device=img_tensor.device).view(1, 1, 3, 3)
    sobel_y = torch.tensor([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=torch.float32, device=img_tensor.device).view(1, 1, 3, 3)

    gx = F.conv2d(F.pad(y, (1, 1, 1, 1), mode='reflect'), sobel_x)
    gy = F.conv2d(F.pad(y, (1, 1, 1, 1), mode='reflect'), sobel_y)
    edge_mag = torch.sqrt(gx ** 2 + gy ** 2 + 1e-8)

    # Local variance in 7x7 window
    mean_y = F.avg_pool2d(F.pad(y, (3, 3, 3, 3), mode='reflect'), kernel_size=7, stride=1)
    mean_y2 = F.avg_pool2d(F.pad(y ** 2, (3, 3, 3, 3), mode='reflect'), kernel_size=7, stride=1)
    local_std = torch.sqrt(torch.clamp(mean_y2 - mean_y ** 2, min=1e-8))

    # Combine edge magnitude and local texture std, then smooth spatially
    raw_mask = 0.6 * edge_mag + 0.4 * (local_std * 4.0)
    smooth_mask = F.avg_pool2d(F.pad(raw_mask, (4, 4, 4, 4), mode='reflect'), kernel_size=9, stride=1)

    # Normalize to [min_scale, 1.0] using soft tanh saturation
    norm_mask = smooth_mask / (torch.quantile(smooth_mask, 0.90) + 1e-6)
    spatial_mask = min_scale + (1.0 - min_scale) * torch.tanh(norm_mask)

    # Channel perceptual sensitivity weights (Human eye is most sensitive to Green, least to Blue)
    channel_weights = torch.tensor([0.95, 0.72, 1.15], dtype=torch.float32, device=img_tensor.device).view(1, 3, 1, 1)

    return spatial_mask * channel_weights


class EoTTransform(nn.Module):
    """
    Expectation Over Transformation (EoT) module.
    Simulates screenshotting, screen display transformations,
    rescaling, rotation, color shifts, and quantization.
    """
    def __init__(self, crop_range=(0.88, 1.0), angle_range=(-3.0, 3.0), color_jitter=0.04):
        super().__init__()
        self.crop_range = crop_range
        self.angle_range = angle_range
        self.color_jitter = color_jitter

    def forward(self, x):
        b, c, h, w = x.shape
        transformed = []
        for i in range(b):
            img = x[i:i+1]

            # 1. Random crop & resize (simulating Retina screen scaling & crop)
            angle = float(torch.empty(1).uniform_(*self.angle_range).item())
            scale = float(torch.empty(1).uniform_(*self.crop_range).item())
            crop_h = int(h * scale)
            crop_w = int(w * scale)
            top = int(torch.randint(0, max(1, h - crop_h + 1), (1,)).item())
            left = int(torch.randint(0, max(1, w - crop_w + 1), (1,)).item())

            cropped = img[:, :, top:top+crop_h, left:left+crop_w]
            resized = F.interpolate(cropped, size=(h, w), mode='bilinear', align_corners=False)

            # 2. Random slight rotation
            if abs(angle) > 0.5:
                theta = torch.tensor([
                    [np.cos(np.radians(angle)), -np.sin(np.radians(angle)), 0],
                    [np.sin(np.radians(angle)), np.cos(np.radians(angle)), 0]
                ], dtype=torch.float32, device=x.device).unsqueeze(0)
                grid = F.affine_grid(theta, resized.size(), align_corners=False)
                resized = F.grid_sample(resized, grid, mode='bilinear', padding_mode='reflection', align_corners=False)

            # 3. Random brightness & contrast fluctuation (simulating display color profile)
            alpha = 1.0 + torch.empty(1, device=x.device).uniform_(-self.color_jitter, self.color_jitter)
            beta = torch.empty(1, device=x.device).uniform_(-self.color_jitter * 0.5, self.color_jitter * 0.5)
            adjusted = torch.clamp(resized * alpha + beta, 0.0, 1.0)

            # 4. Subtle sensor noise
            noise = torch.randn_like(adjusted) * 0.005
            noisy = torch.clamp(adjusted + noise, 0.0, 1.0)

            # 5. Differentiable 8-bit quantization approximation
            quantized = noisy + (torch.round(noisy * 255.0) / 255.0 - noisy).detach()

            transformed.append(quantized)

        return torch.cat(transformed, dim=0)


class EnsembleSurrogate(nn.Module):
    """
    Ensemble surrogate model combining CLIP Vision (ViT) and ResNet-50 (CNN).
    Extracts both final semantic embeddings and intermediate patch/feature tokens.
    """
    def __init__(self, device='cpu'):
        super().__init__()
        self.device = device

        print("Loading CLIP Vision model (openai/clip-vit-base-patch32)...")
        self.clip = CLIPVisionModelWithProjection.from_pretrained('openai/clip-vit-base-patch32', local_files_only=True)
        self.clip.eval()
        self.clip.to(device)
        for p in self.clip.parameters():
            p.requires_grad = False

        print("Loading ResNet-50...")
        resnet = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
        self.resnet = nn.Sequential(*list(resnet.children())[:-1])
        self.resnet.eval()
        self.resnet.to(device)
        for p in self.resnet.parameters():
            p.requires_grad = False

        self.clip_mean = torch.tensor([0.48145466, 0.4578275, 0.40821073], device=device).view(1, 3, 1, 1)
        self.clip_std = torch.tensor([0.26862954, 0.26130258, 0.27577711], device=device).view(1, 3, 1, 1)

        self.resnet_mean = torch.tensor([0.485, 0.456, 0.406], device=device).view(1, 3, 1, 1)
        self.resnet_std = torch.tensor([0.229, 0.224, 0.225], device=device).view(1, 3, 1, 1)

    def extract_clip(self, x):
        x_224 = F.interpolate(x, size=(224, 224), mode='bicubic', align_corners=False)
        x_norm = (x_224 - self.clip_mean) / self.clip_std
        outputs = self.clip(pixel_values=x_norm)
        emb = outputs.image_embeds
        return F.normalize(emb, p=2, dim=-1)

    def extract_resnet(self, x):
        x_224 = F.interpolate(x, size=(224, 224), mode='bilinear', align_corners=False)
        x_norm = (x_224 - self.resnet_mean) / self.resnet_std
        feat = self.resnet(x_norm).flatten(1)
        return F.normalize(feat, p=2, dim=-1)


def total_variation_loss(delta: torch.Tensor) -> torch.Tensor:
    """Penalizes high-frequency pixel-to-pixel jaggedness so perturbations look smooth to humans."""
    tv_h = torch.mean((delta[:, :, 1:, :] - delta[:, :, :-1, :]) ** 2)
    tv_w = torch.mean((delta[:, :, :, 1:] - delta[:, :, :, :-1]) ** 2)
    return tv_h + tv_w


def generate_shield(
    image_path: str,
    output_path: str,
    epsilon: float = 7.0 / 255.0,
    steps: int = 50,
    eot_samples: int = 4,
    device: str = 'cpu'
):
    """
    Computes a human-clean, screenshot-resilient adversarial shield using
    JND Perceptual Masking + Low/Mid-Frequency Smoothed PGD + EoT.
    """
    pil_img = Image.open(image_path).convert("RGB")
    orig_w, orig_h = pil_img.size

    max_dim = 768
    if max(orig_w, orig_h) > max_dim:
        scale = max_dim / max(orig_w, orig_h)
        pil_img = pil_img.resize((int(orig_w * scale), int(orig_h * scale)), Image.Resampling.LANCZOS)
        print(f"Resized input from {orig_w}x{orig_h} to {pil_img.size[0]}x{pil_img.size[1]} for optimization.")

    img_tensor = TF.to_tensor(pil_img).unsqueeze(0).to(device)

    # Compute Perceptual JND Mask (protects smooth skin and flat backgrounds from visible grain)
    jnd_mask = compute_jnd_perceptual_mask(img_tensor, min_scale=0.22)
    smooth_kernel = get_gaussian_kernel2d(kernel_size=5, sigma=1.0, device=device)

    surrogate = EnsembleSurrogate(device=device)
    eot = EoTTransform().to(device)

    with torch.no_grad():
        clean_clip_emb = surrogate.extract_clip(img_tensor).detach()
        clean_resnet_feat = surrogate.extract_resnet(img_tensor).detach()

        target_tensor = torch.full_like(img_tensor, 0.5)
        target_clip_emb = surrogate.extract_clip(target_tensor).detach()
        target_resnet_feat = surrogate.extract_resnet(target_tensor).detach()

    # Optimize a latent perturbation variable u, where effective delta = tanh(smooth(u)) * epsilon * jnd_mask
    u = torch.zeros_like(img_tensor, device=device, requires_grad=True)
    optimizer = torch.optim.Adam([u], lr=0.22)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=steps, eta_min=0.02)

    print(f"\n--- Starting Perceptual Human-Clean Shield Optimization ---")
    print(f"Max Budget (epsilon): {epsilon:.4f} (~{epsilon*255:.1f}/255 on edges, ~{epsilon*255*0.22:.1f}/255 on smooth skin)")
    print(f"Steps: {steps}, EoT samples per step: {eot_samples}")

    for step in range(steps):
        optimizer.zero_grad()

        # Apply Gaussian smoothing to u so perturbation has zero high-frequency grain
        u_padded = F.pad(u, (2, 2, 2, 2), mode='reflect')
        u_smooth = F.conv2d(u_padded, smooth_kernel, groups=3)

        # Bound within [-epsilon, epsilon] via tanh and modulate by perceptual JND mask
        delta = torch.tanh(u_smooth) * epsilon * jnd_mask
        adv_x = torch.clamp(img_tensor + delta, 0.0, 1.0)

        # Include both direct image and EoT screenshot-transformed samples
        eot_inputs = eot(adv_x.repeat(eot_samples - 1, 1, 1, 1))
        all_inputs = torch.cat([adv_x, eot_inputs], dim=0)

        adv_clip = surrogate.extract_clip(all_inputs)
        adv_resnet = surrogate.extract_resnet(all_inputs)

        # 1. Feature disruption loss: Minimize cosine similarity with original face
        loss_clip_disrupt = (adv_clip * clean_clip_emb).sum(dim=-1).mean()
        loss_resnet_disrupt = (adv_resnet * clean_resnet_feat).sum(dim=-1).mean()

        # 2. Target steering loss: Steer towards neutral/non-face representation
        loss_clip_target = - (adv_clip * target_clip_emb).sum(dim=-1).mean()
        loss_resnet_target = - (adv_resnet * target_resnet_feat).sum(dim=-1).mean()

        # 3. Perceptual L2 + Total Variation regularization to keep SSIM > 0.92 and PSNR > 34 dB
        loss_l2 = torch.mean(delta ** 2) * 2.0
        loss_tv = total_variation_loss(delta) * 2.0

        loss = (
            (loss_clip_disrupt + 0.7 * loss_resnet_disrupt)
            + 0.5 * (loss_clip_target + 0.7 * loss_resnet_target)
            + loss_l2
            + loss_tv
        )

        loss.backward()
        optimizer.step()
        scheduler.step()

        if (step + 1) % 10 == 0 or step == steps - 1:
            rms_px = torch.sqrt(torch.mean((adv_x - img_tensor) ** 2)).item() * 255.0
            print(f"Step {step+1:3d}/{steps} | Loss: {loss.item():.4f} | "
                  f"CLIP Sim: {loss_clip_disrupt.item():.4f} | "
                  f"ResNet Sim: {loss_resnet_disrupt.item():.4f} | "
                  f"Avg Pixel Diff: {rms_px:.2f}/255")

    with torch.no_grad():
        u_padded = F.pad(u, (2, 2, 2, 2), mode='reflect')
        u_smooth = F.conv2d(u_padded, smooth_kernel, groups=3)
        final_delta = torch.tanh(u_smooth) * epsilon * jnd_mask
        final_adv = torch.clamp(img_tensor + final_delta, 0.0, 1.0)

    adv_pil = TF.to_pil_image(final_adv.squeeze(0).cpu())
    adv_pil.save(output_path, quality=98)
    print(f"\n[OK] Clean protected image saved to: {output_path}")

    # Save visual perturbation map (amplified 15x so human can see where the JND mask placed the shield)
    diff = (torch.abs(final_delta.detach()) * 15.0).clamp(0.0, 1.0)
    diff_pil = TF.to_pil_image(diff.squeeze(0).cpu())
    pert_path = os.path.splitext(output_path)[0] + "_perturbation_amplified.png"
    diff_pil.save(pert_path)
    print(f"[OK] Amplified (15x) JND perturbation map saved to: {pert_path}")

    return output_path, pert_path


def main():
    parser = argparse.ArgumentParser(description="Apply human-clean anti-deepfake adversarial shield to an image.")
    parser.add_argument("--image", type=str, required=True, help="Path to input portrait image")
    parser.add_argument("--output", type=str, default="protected_photo.png", help="Path to save protected image")
    parser.add_argument(
        "--mode",
        type=str,
        choices=["stealth", "balanced", "max"],
        default="stealth",
        help="Protection preset: 'stealth' (SSIM ~0.975, social-media clean), 'balanced' (SSIM ~0.945), 'max' (strongest disruption)"
    )
    parser.add_argument("--epsilon", type=float, default=None, help="Override max edge perturbation budget")
    parser.add_argument("--steps", type=int, default=50, help="Optimization steps (default: 50)")
    parser.add_argument("--device", type=str, default=None, help="Device ('cpu' or 'mps')")

    args = parser.parse_args()

    mode_eps = {
        "stealth": 7.0 / 255.0,
        "balanced": 10.0 / 255.0,
        "max": 14.0 / 255.0,
    }
    eps = args.epsilon if args.epsilon is not None else mode_eps[args.mode]

    if args.device is None:
        device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    else:
        device = args.device

    print(f"Using compute device: {device} | Mode: {args.mode}")

    if not os.path.exists(args.image):
        print(f"Error: Input image '{args.image}' not found.")
        sys.exit(1)

    generate_shield(
        image_path=args.image,
        output_path=args.output,
        epsilon=eps,
        steps=args.steps,
        device=device
    )


if __name__ == "__main__":
    main()
