"""Player activity from background subtraction.

During dead time players walk slowly, bend for balls or stand still at the
towel. During a rally both halves of the frame show fast, sustained motion.
We measure the share of foreground pixels on each side of the net (outside
the table itself, so the ball and its shadow don't count).
"""

from __future__ import annotations

import numpy as np

from ..types import TableGeometry


class PlayerActivity:
    def __init__(self, table: TableGeometry | None, frame_size: tuple[int, int]):
        import cv2

        self._cv2 = cv2
        w, h = frame_size
        self.bg = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=32, detectShadows=False)
        table_mask = np.zeros((h, w), np.uint8)
        side_a = np.zeros((h, w), np.uint8)
        if table is not None:
            c = table.corners.astype(np.int32)
            cv2.fillConvexPoly(table_mask, c, 255)
            # split the frame by the line through the net's two image endpoints
            p, q = self._net_endpoints(table)
            yy, xx = np.mgrid[0:h, 0:w]
            cross = (q[0] - p[0]) * (yy - p[1]) - (q[1] - p[1]) * (xx - p[0])
            side_a[cross > 0] = 255
        else:
            side_a[:, : w // 2] = 255
        self.valid = cv2.bitwise_not(table_mask)
        self.side_a = cv2.bitwise_and(side_a, self.valid)
        self.side_b = cv2.bitwise_and(cv2.bitwise_not(side_a), self.valid)
        self._area_a = max(int(np.count_nonzero(self.side_a)), 1)
        self._area_b = max(int(np.count_nonzero(self.side_b)), 1)

    @staticmethod
    def _net_endpoints(table: TableGeometry) -> tuple[np.ndarray, np.ndarray]:
        h_inv = np.linalg.inv(table.homography)
        pts = []
        for y in (0.0, 152.5):
            v = h_inv @ np.array([137.0, y, 1.0])
            pts.append(v[:2] / v[2])
        return pts[0], pts[1]

    def update(self, image: np.ndarray) -> tuple[float, float]:
        """Return the foreground fraction on each side of the net."""
        cv2 = self._cv2
        fg = self.bg.apply(image)
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        a = np.count_nonzero(cv2.bitwise_and(fg, self.side_a)) / self._area_a
        b = np.count_nonzero(cv2.bitwise_and(fg, self.side_b)) / self._area_b
        return float(a), float(b)
