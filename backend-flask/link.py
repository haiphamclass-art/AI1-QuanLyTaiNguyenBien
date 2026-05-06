"""
Compatibility shim for older scikit-learn pickles that import `link` directly.
"""

from importlib import import_module


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


_module = import_module("sklearn._loss.link")

for _name in dir(_module):
    if _name in _SKIP_NAMES:
        continue
    globals()[_name] = getattr(_module, _name)

__all__ = [
    name for name in globals()
    if not name.startswith("_") or name.startswith("__pyx_")
]
