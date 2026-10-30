from pathlib import Path

import pytest

from ttvision.config import PipelineConfig


def test_default_yaml_loads():
    cfg = PipelineConfig.load(Path(__file__).parent.parent / "configs" / "default.yaml")
    assert cfg.rally.pre_roll_s == 1.0
    assert cfg.audio.band_low_hz == 2500 and cfg.audio.band_high_hz == 4000


def test_unknown_key_rejected():
    with pytest.raises(ValueError):
        PipelineConfig.from_dict({"rally": {"pre_rol_s": 2}})
