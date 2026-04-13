"""Compatibility shim for legacy scikit-learn pickle references."""

from importlib import import_module


_module = import_module("sklearn._loss.link")

for _name in dir(_module):
    if _name.startswith("__") and _name != "__all__":
        continue
    globals()[_name] = getattr(_module, _name)


__all__ = getattr(
    _module,
    "__all__",
    sorted(name for name in globals() if not name.startswith("__")),
)
