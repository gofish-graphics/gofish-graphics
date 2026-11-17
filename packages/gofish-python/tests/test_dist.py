"""Distributions (stack profiles S11): the field members and the ``Dist``
families go on the wire as data, the same JSON the JS builders write."""

import pytest

import gofish
from gofish import Dist, field


def test_field_members_are_a_sample_then_a_member():
    assert field("x").density() == {
        "type": "field",
        "name": "x",
        "ops": [{"op": "sample"}, {"op": "member", "name": "density"}],
    }
    assert field("x").quantile(0.9)["ops"][-1] == {
        "op": "member",
        "name": "quantile",
        "args": [0.9],
    }
    assert field("x").support()["ops"][-1]["name"] == "support"
    assert field("x").cdf()["ops"][-1]["name"] == "cdf"


def test_quantile_checks_p():
    with pytest.raises(ValueError):
        field("x").quantile(1.5)
    with pytest.raises(ValueError):
        Dist.normal(mean=0, sd=1).quantile(-0.1)


def test_a_family_is_data():
    d = Dist.normal(mean="mean", sd=field("sd").mean())
    assert d.density() == {
        "type": "dist",
        "family": "normal",
        "params": {
            "mean": "mean",
            "sd": {"type": "field", "name": "sd", "ops": [{"op": "mean"}]},
        },
        "ops": [{"op": "member", "name": "density"}],
    }
    # Each member is a new expression; the family is unchanged.
    assert "ops" not in d
    assert Dist.uniform(min=0, max=1).median()["ops"] == [
        {"op": "member", "name": "median"}
    ]
    assert Dist.exponential(rate=2)["params"] == {"rate": 2}
    assert Dist.lognormal(meanlog=0, sdlog=1)["family"] == "lognormal"


def test_a_parameter_is_a_number_a_column_or_an_expression():
    with pytest.raises(TypeError):
        Dist.normal(mean=[1, 2], sd=1)


def test_dist_is_the_module():
    import gofish.dist

    assert gofish.Dist is gofish.dist
    assert "Dist" in gofish.__all__
    assert "normal" not in gofish.__all__
