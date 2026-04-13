"""Compatibility patches for legacy XGBoost sklearn pickles."""

import inspect

from xgboost.sklearn import XGBModel


def patch_xgbmodel_defaults():
    """Expose missing init params as class attributes for unpickled legacy models.

    Older pickled sklearn wrappers may not contain newer/renamed attributes.
    XGBoost accesses them through ``get_params()``, which uses ``getattr`` and
    crashes if the attribute is absent on the instance. Setting class-level
    defaults makes those lookups safe without mutating every loaded model.
    """

    for name, parameter in inspect.signature(XGBModel.__init__).parameters.items():
        if name in {'self', 'kwargs'}:
            continue

        if hasattr(XGBModel, name):
            continue

        default_value = None if parameter.default is inspect._empty else parameter.default
        setattr(XGBModel, name, default_value)


patch_xgbmodel_defaults()
