# Pro stroke library

One JSON file per reference stroke. Create entries from a short clip that
contains a single stroke (you need the rights to use the footage):

```bash
ttvision add-pro clip.mp4 --id fh_loop_vs_backspin_01 --player "Pro name" \
  --stroke forehand_topspin --context vs_backspin --start 1.2 --end 2.4
```

Fields: `id`, `player`, `stroke_type` (a `StrokeType` value), `context`
(`vs_backspin`, `vs_topspin`, `any`...), `handedness`, `contact_time`
(optional; otherwise the racket-speed peak), `video_url`, and the landmark
arrays `times` (T), `world` (T x 33 x 3, metres) and `image` (T x 33 x 3).
