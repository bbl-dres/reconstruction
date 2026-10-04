# Segmentation

[← Findings](README.md)

Can individual elements, such as paintings, windows, doors, walls and stairs, be extracted from the capture? Analysis only, October 2026; nothing here has been run.

## Summary

- **SAM 3D is the wrong tool for most of the list.** It generates a 3D model of one object from one photo; it does not segment existing scans.
- **The most promising route is SAM 3 in 2D, lifted to 3D with the Matterport poses** we already have. It would give an inventory of paintings, doors and windows with positions and sizes.
- **Walls are better found geometrically** (plane fitting) than by image segmentation.
- **Hardware:** SAM 3 and the 3D-native tools need 16–40 GB of GPU memory; see [compute.md](compute.md).

## SAM 3D

[SAM 3D](https://ai.meta.com/research/sam3d/) takes one photo and a mask and generates a standalone 3D model of that object, including the sides the photo cannot see. The invented back sides are not measurements. It could produce showpiece models of free-standing objects (chairs, the tiled stove, sculptures), but adds little for paintings, windows, doors, walls or stairs, which are flat or built in.

## SAM 3, lifted to 3D

[SAM 3](https://ai.meta.com/sam3/) finds every instance of a text prompt ("painting", "door", "window", "staircase") in an image. The data suits it unusually well:

1. **Segment in 2D:** run SAM 3 on the 636 cube faces.
2. **Lift to 3D:** the camera poses are accurate (0.5 px median error). Each masked pixel gets a depth, rendered from the splat or ray-cast against the archived Matterport mesh (whether the mesh lines up with the panoramas is not yet checked).
3. **Merge across views:** each object appears in several panoramas; merge instances by 3D overlap and use the number of views as a confidence.

| Element | What it would produce |
|---|---|
| Paintings | Position, plane and width × height, plus a straightened crop from the most frontal view. A 1 m painting seen from 3 m covers about 400 px, effectively half that given the soft source images: enough for an inventory, not for reproduction |
| Windows and doors | Position, width, height, sill height and host wall, close to the IfcWindow/IfcDoor records of the Bundeshaus inventory |
| Stairs | Found by SAM 3; step geometry from mesh or splat depth |
| Walls | Better from planes fitted to dense geometry |
| Splat cut-outs | Each Gaussian takes the label most views agree on, giving one splat per object; clean from capture positions and foggy elsewhere, like the whole splat |

SAM 3 recommends 16 GB or more; a lighter pairing (Grounding DINO with a small SAM 2) probably fits the laptop's 8 GB. SAM 3 is under Meta's "SAM License", whose terms would need checking for BBL use.

## 3D-native alternatives

| Approach | Notes |
|---|---|
| Models trained on Matterport-style scans (Point Transformer V3 on ScanNet200 or Matterport3D) | Label exactly these classes (wall, door, window, picture, stairs), but need a dense coloured point cloud. Ours has only 74k triangulated points, the mesh is coarse, and splat centres include floaters, so depth would have to be fused first |
| Open-vocabulary 3D instance segmentation (OpenMask3D, Open3DIS, OpenScene, Open-YOLO 3D) | Take a point cloud plus posed images and text queries. Developed on 24–40 GB GPUs (Open-YOLO 3D: A100 40 GB; OpenScene feature fusion: over 30 GB), pinned to CUDA 11 and Linux, with custom GPU operators to compile |
| Splat-native methods (SAGA, Gaussian Grouping, OpenGaussian) | Build segmentation into training; heavier, research-grade code |
| Manual | The SuperSplat editor selects, crops and exports parts of a splat by hand |

## What the archive already provides

- 10 named rooms with 3D positions (Grosser Salon, Gelber Salon, Empire Salon, Treppenhaus and others) and 22 Matterport room records with floor areas and ceiling heights.
- Matterport's automatic room tags are unreliable ("bathroom" eight times, a 110 m² "patio, bathroom"), and this tour has no room outlines.

## Suggested pilot

One room, for example the Grosser Salon (about 6 positions, 36 faces): run SAM 3 or Grounding DINO with SAM 2 on those faces, lift the results with the poses, and write an inventory of paintings, doors and windows with positions, sizes and crops. Check a few dimensions on site or against plans.
