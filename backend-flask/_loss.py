"""Compatibility shim for legacy scikit-learn pickle references."""

from importlib import import_module

import numpy as np


def _copy_module_symbols(module_name):
    module = import_module(module_name)
    for name in dir(module):
        if name.startswith("__") and not name.startswith("__pyx_unpickle_"):
            continue
        globals()[name] = getattr(module, name)


for _module_name in ("sklearn._loss._loss", "sklearn._loss.loss"):
    _copy_module_symbols(_module_name)


def _patched_get_init_raw_predictions(self, *args, **kwargs):
    estimator = kwargs.get("estimator")
    X = kwargs.get("X")

    if estimator is None:
        estimator = next((arg for arg in args if hasattr(arg, "predict")), None)

    if X is None:
        for arg in args:
            if arg is estimator:
                continue
            if hasattr(arg, "shape") or hasattr(arg, "__array__") or hasattr(arg, "__len__"):
                X = arg
                break

    if estimator is None or X is None:
        raise TypeError("Could not infer estimator and feature matrix for get_init_raw_predictions")

    raw_predictions = np.asarray(estimator.predict(X), dtype=np.float64)
    if raw_predictions.ndim == 1:
        raw_predictions = raw_predictions.reshape(-1, 1)
    return raw_predictions


for _class_name in (
    "BaseLoss",
    "HalfSquaredError",
    "AbsoluteError",
    "HuberLoss",
    "PinballLoss",
    "HalfPoissonLoss",
    "HalfGammaLoss",
    "HalfTweedieLoss",
):
    _class = globals().get(_class_name)
    if _class is not None and not hasattr(_class, "get_init_raw_predictions"):
        _class.get_init_raw_predictions = _patched_get_init_raw_predictions


__all__ = sorted(
    name
    for name in globals()
    if not name.startswith("__") or name.startswith("__pyx_unpickle_")
)
