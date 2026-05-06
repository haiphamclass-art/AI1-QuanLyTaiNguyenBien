"""
Compatibility shim for older scikit-learn pickles that import `_loss` directly.

Older pickles may reference private Cython helpers such as
`__pyx_unpickle_CyHalfSquaredError`. Wildcard imports skip those names, so we
copy attributes explicitly from the current scikit-learn modules.
"""

from importlib import import_module
import numpy as np


_SKIP_NAMES = {
    "__builtins__",
    "__cached__",
    "__doc__",
    "__file__",
    "__loader__",
    "__name__",
    "__package__",
    "__spec__",
}


def _export_module(module_name):
    module = import_module(module_name)
    for name in dir(module):
        if name in _SKIP_NAMES:
            continue
        globals()[name] = getattr(module, name)


_export_module("sklearn._loss._loss")
_export_module("sklearn._loss.loss")
_export_module("sklearn._loss.link")


def _patch_loss_compat():
    # scikit-learn 1.5.x regression pickles expect this method on loss objects
    # when GradientBoostingRegressor computes initial raw predictions.
    def _get_init_raw_predictions(self, X, estimator):
        predictions = estimator.predict(X)
        predictions = np.asarray(predictions)
        if predictions.ndim == 1:
            predictions = predictions.reshape(-1, 1)
        return predictions.astype(np.float64, copy=False)

    for loss_name in (
        "BaseLoss",
        "HalfSquaredError",
        "AbsoluteError",
        "PinballLoss",
        "HuberLoss",
        "HalfPoissonLoss",
        "HalfGammaLoss",
        "HalfTweedieLoss",
        "HalfTweedieLossIdentity",
    ):
        loss_cls = globals().get(loss_name)
        if loss_cls is not None and not hasattr(loss_cls, "get_init_raw_predictions"):
            setattr(loss_cls, "get_init_raw_predictions", _get_init_raw_predictions)


_patch_loss_compat()

__all__ = [
    name for name in globals()
    if not name.startswith("_") or name.startswith("__pyx_")
]
