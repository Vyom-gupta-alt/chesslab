"""Table detection and court coordinates.

The playing surface is a large, uniformly coloured (blue or green) quad. We
segment it in HSV, keep the largest blob, and fit a 4-point polygon. Corners
are voted across several frames (median) so players occluding an edge in one
frame don't move the result. A homography then maps image pixels to table
centimetres: x along the length (0..274, net at 137), y across (0..152.5).

Manual corners (clicked in the UI) always win over detection.
"""

from __future__ import annotations

from typing import Sequence

import numpy as np

from ..types import TableGeometry

TABLE_LENGTH_CM = 274.0
TABLE_WIDTH_CM = 152.5
NET_X_CM = TABLE_LENGTH_CM / 2

# HSV ranges (OpenCV: H in 0..179)
_COLOR_RANGES = {
    "blue": ((95, 70, 40), (130, 255, 255)),
    "green": ((40, 60, 30), (85, 255, 230)),
}


def order_corners(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as top-left, top-right, bottom-right, bottom-left."""
    pts = np.asarray(pts, dtype=np.float32).reshape(4, 2)
    centre = pts.mean(axis=0)
    angles = np.arctan2(pts[:, 1] - centre[1], pts[:, 0] - centre[0])
    pts = pts[np.argsort(angles)]          # clockwise in image coords, starting near -pi (left)
    # rotate so the first point is the one with the smallest x + y (top-left)
    start = int(np.argmin(pts.sum(axis=1)))
    return np.roll(pts, -start, axis=0)


def camera_view(corners: np.ndarray) -> str:
    """Guess "end" (camera behind a player) or "side" (camera level with the net).

    Seen from behind, the far end line looks much shorter than the near one
    (strong perspective along the table). Seen from the side, the two long
    edges are at similar distances, so they look similar in length.
    """
    c = order_corners(corners)
    top, bottom = np.linalg.norm(c[1] - c[0]), np.linalg.norm(c[2] - c[3])
    ratio = min(top, bottom) / max(top, bottom, 1e-6)
    return "end" if ratio < 0.82 else "side"


def table_homography(corners: np.ndarray, view: str = "auto") -> np.ndarray:
    """Homography from image pixels to table cm (x along the length, net at 137)."""
    import cv2

    c = order_corners(corners)
    if view == "auto":
        view = camera_view(c)
    if view == "side":   # image x runs along the table length
        dst = np.array([[0, 0], [TABLE_LENGTH_CM, 0],
                        [TABLE_LENGTH_CM, TABLE_WIDTH_CM], [0, TABLE_WIDTH_CM]], np.float32)
    else:                # image y runs along the length, far end at the top
        dst = np.array([[0, 0], [0, TABLE_WIDTH_CM],
                        [TABLE_LENGTH_CM, TABLE_WIDTH_CM], [TABLE_LENGTH_CM, 0]], np.float32)
    return cv2.getPerspectiveTransform(c, dst)


def to_table_coords(h: np.ndarray, xy: Sequence[float]) -> tuple[float, float]:
    p = h @ np.array([xy[0], xy[1], 1.0])
    return float(p[0] / p[2]), float(p[1] / p[2])


class TableDetector:
    def __init__(self, colors: Sequence[str] = ("blue", "green"), min_area_frac: float = 0.03,
                 view: str = "auto"):
        self.colors = list(colors)
        self.view = view
        self.min_area_frac = min_area_frac

    def detect_frame(self, image: np.ndarray) -> np.ndarray | None:
        """Return 4 ordered corners for one BGR frame, or None."""
        import cv2

        h, w = image.shape[:2]
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        best, best_area = None, self.min_area_frac * h * w
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        for name in self.colors:
            lo, hi = _COLOR_RANGES[name]
            mask = cv2.inRange(hsv, np.array(lo), np.array(hi))
            # close the white lines and the net so the surface is one blob
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=3)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area <= best_area:
                    continue
                quad = self._fit_quad(cnt)
                if quad is not None:
                    best, best_area = self._refine_corners(order_corners(quad), cnt), area
        return None if best is None else order_corners(best)

    @staticmethod
    def _fit_quad(contour: np.ndarray) -> np.ndarray | None:
        import cv2

        hull = cv2.convexHull(contour)
        peri = cv2.arcLength(hull, True)
        for eps in np.linspace(0.01, 0.08, 15):
            approx = cv2.approxPolyDP(hull, eps * peri, True)
            if len(approx) == 4:
                return approx.reshape(4, 2).astype(np.float32)
        return None

    @staticmethod
    def _refine_corners(quad: np.ndarray, contour: np.ndarray) -> np.ndarray:
        """Fit a line to each table edge and intersect neighbours.

        Polygon approximation cuts corners; edges are long and straight, so
        their intersections are far more precise.
        """
        import cv2

        pts = contour.reshape(-1, 2).astype(np.float32)
        lines = []
        for i in range(4):
            a, b = quad[i], quad[(i + 1) % 4]
            ab = b - a
            length = float(np.linalg.norm(ab)) or 1.0
            u = ((pts - a) @ ab) / (length * length)                 # position along the edge
            rel = pts - a
            dist = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / length   # distance to the edge
            near = pts[(u > 0.15) & (u < 0.85) & (dist < max(4.0, 0.03 * length))]
            if len(near) < 5:
                return quad
            vx, vy, x0, y0 = cv2.fitLine(near, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
            lines.append((np.array([x0, y0]), np.array([vx, vy])))
        out = []
        for i in range(4):
            (p1, d1), (p2, d2) = lines[i - 1], lines[i]
            m = np.array([d1, -d2]).T
            if abs(np.linalg.det(m)) < 1e-6:
                return quad
            s_, _ = np.linalg.solve(m, p2 - p1)
            out.append(p1 + s_ * d1)
        refined = np.array(out, np.float32)
        # guard against a bad fit (e.g. a player covering most of an edge)
        if np.abs(refined - quad).max() > 0.1 * float(np.ptp(quad[:, 0]) + 1):
            return quad
        return refined

    def detect(self, images: Sequence[np.ndarray],
               manual_corners: Sequence[Sequence[float]] | None = None) -> TableGeometry | None:
        if not images:
            return None
        h, w = images[0].shape[:2]
        if manual_corners is not None:
            corners = order_corners(np.asarray(manual_corners, np.float32))
        else:
            found = [c for c in (self.detect_frame(img) for img in images) if c is not None]
            if not found:
                return None
            # median per corner is robust to frames where a player hides an edge
            corners = np.median(np.stack(found), axis=0).astype(np.float32)
        return TableGeometry(corners=corners, homography=table_homography(corners, self.view),
                             frame_size=(w, h))
