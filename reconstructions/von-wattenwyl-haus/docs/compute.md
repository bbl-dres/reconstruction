# Compute

[← Findings](README.md)

Whether the laptop is enough, and what an external GPU or a rented cloud GPU would add. Analysis only, October 2026; prices change.

## Summary

- **The laptop handles today's pipeline.** Training a 3 million splat takes 40–80 minutes.
- **Memory, not speed, blocks the next steps.** Bigger splats, SAM 3 and the 3D segmentation tools need 16–48 GB of GPU memory; the laptop has 8 GB.
- **Rent rather than buy.** The tour data is public and this is an experiment, so a few hours on a rented 24–80 GB GPU (a few francs to a few dozen) unlocks what 8 GB blocks. A 24–32 GB card costs CHF 1,800–5,000 or more in Switzerland.

## The laptop

Dell Pro Max 16 Premium (MA16250): Core Ultra 7 265H, 32 GB RAM, NVIDIA RTX PRO 1000 Blackwell with 8 GB plus Intel Arc 140T, two Thunderbolt 5 ports and one Thunderbolt 4.

| Task | On the laptop |
|---|---|
| Splat training, 3 million cap (LichtFeld, Brush) | Yes: 15k steps 17 min, 30k 40 min, 60k 79 min. About 15 steps/s while the splat grows, 8–9 once it reaches the cap. LichtFeld is not several times faster than Brush here |
| Bigger splats (10–15 million Gaussians) | No: the cap is set by the 8 GB |
| Lighter 2D segmentation (Grounding DINO with a small SAM 2) | Likely |
| SAM 3 | No: 16 GB or more recommended |
| Open-vocabulary 3D segmentation | No: developed on 24–40 GB, and their CUDA 11 builds do not run on Blackwell (needs CUDA 12.8+) |
| Camera alignment with LoMa, whole house | No: its descriptor model fills about 7.9 of the 8 GB; two attempts ended in system crashes (a GPU hang, then a fatal hardware error report). A ground floor of 55 positions worked (76 min) |
| Splat viewer in the browser | Yes, on the Intel GPU as well |

## External GPU over Thunderbolt 5

Possible with this laptop. A Thunderbolt 5 enclosure (for example the Razer Core X V2, about USD 350–400) holds a full-size card; it has no built-in power supply, so a desktop power supply sized for the card is needed (high-end cards draw 450–600 W).

- **Bandwidth** is about a quarter-width PCIe 4.0 slot (64 Gbps). For training that is a modest penalty: the model stays in the card's memory and only images cross the cable. Use a Thunderbolt 5 port; the Thunderbolt 4 port is half as fast.
- **Which card:** 24–32 GB (for example an RTX 5090) for splat training and current models; an older RTX 3090 (24 GB) or RTX A6000 (48 GB) also runs the CUDA 11 research code as published.
- **Practicalities:** IT approval for Thunderbolt devices on a managed laptop; point tools at the external card (`CUDA_VISIBLE_DEVICES`); Linux-only research code runs in WSL2 or Linux; it is a desk setup.

**An RTX 3070 (8 GB)** would train somewhat faster than the laptop GPU but has the same 8 GB, so it unlocks none of the memory-bound steps. Not worth an enclosure; use it only if a desktop PC is at hand.

**Buying hardware** does not pay off for an experiment: in Switzerland a used RTX 3090 starts around CHF 1,800, a used RTX 4090 around CHF 2,500, an RTX 5090 over CHF 5,000 and an RTX PRO 6000 from CHF 12,000.

## Cloud GPU

Renting is borrowing a Linux machine with a large GPU by the hour: start it, copy the data, run the job, copy the results back, delete it.

1. **Pick a provider and card.** Large clouds (AWS, Azure, Google Cloud, some with Zurich regions), specialist GPU clouds (Lambda, RunPod) or Swiss providers (Exoscale, Infomaniak). Because the data is public, cheaper marketplaces are acceptable too. An A100 (40 or 80 GB) suits everything, including CUDA 11 research code; an L40S (48 GB) or H100 is faster for training. Roughly USD 1–3 per hour for an A100 on specialist clouds.
2. **Start it** from an Ubuntu image with CUDA and PyTorch, or a Docker container for pinned research code. Billing is usually per minute.
3. **Copy only what is needed:** the 1024 px training dataset is about 200 MB, the raw panoramas 260 MB.
4. **Run.** Brush has a Linux build; LichtFeld has to be compiled from source on Linux (our copy is a Windows build); research tools install as their papers describe, ideally in a container.
5. **Download the results and delete the machine and its disk.** A stopped machine's storage keeps billing.

A per-floor splat or a segmentation pilot is a few hours of GPU time: tens rather than hundreds of francs, depending on how much debugging the research code needs. A container recipe and run script would reduce a session to "upload, run one command, download".

### First run: whole-house alignment on RunPod (4 October 2026)

The LoMa alignment of all 106 positions ran on a rented RTX 4090 (24 GB) at RunPod; recipe and results in [alignment/README.md](../alignment/README.md#in-the-cloud).

- **Cost and time:** 32 minutes of computing and about 40 minutes of machine time in all, about USD 0.45 at $0.74/h (secure cloud). Two discarded machines added about USD 0.10.
- **Speed:** LoMa feature extraction ran about five times faster than on the laptop (0.3 s instead of about 1.5 s per image), using 11 of the 24 GB.
- **Data transfer was the slow part to watch:** 200 MB up took 57 s (about 3.5 MB/s from here); 47 MB of results came back in 12 s.
- **Choose the machine by network, not price alone.** A community-cloud RTX 4090 at $0.34/h had no public IP (so no `scp`, only a terminal relay) and downloaded at 0.1 MB/s; it was deleted after 12 minutes. A secure-cloud machine in an EU data centre (EU-CZ-1; RunPod has no Frankfurt or Zurich site) worked at once.
- **Large results:** a trained 3 million splat is 744 MB as `.ply` (plus 1.2 GB of checkpoints that can stay behind), the published LOD viewer about 130 MB. Uploading sources and downloading only final results keeps transfers small; data that is used repeatedly can stay on a network volume in the data centre.

**Rent or buy, for a used RTX 4090 at CHF 2,400** against renting at USD 0.75/h (about CHF 0.60/h), with about CHF 0.17/h of electricity when owned:

| Use | Renting per year | Card pays off after | Card and a PC to hold it (about CHF 4,000) pay off after |
|---|---|---|---|
| 10 h/week | CHF 310 | about 11 years | about 18 years |
| 40 h/week | CHF 1,250 | about 2.7 years | about 4.5 years |
| Around the clock | CHF 5,260 | about 8 months | about 13 months |

Only round-the-clock use justifies buying; at 40 hours a week the card would be a generation old before it paid off.
