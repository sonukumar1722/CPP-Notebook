"""
api/notebooks.py
----------------
Notebooks router — lightweight, filesystem-based.

Most notebook CRUD operations (create, read, update, delete) are handled
by the generic filesystem endpoints in `api/fs.py` since notebooks are
just `.cpynb` JSON files on disk.

This router primarily serves `/kernels` to allow the frontend to
discover available Jupyter kernel specs.
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/notebooks", tags=["notebooks"])

# Preferred kernels — used to sort the available kernels so C++ comes first
PREFERRED_KERNEL_ORDER = ("xcpp17", "xcpp14", "xcpp11")


class KernelSpec(BaseModel):
    """Represents a discovered Jupyter kernel specification."""
    name: str
    display_name: str
    language: str | None = None


def _sort_key(k: KernelSpec):
    """Sort function to push preferred kernels to the top of the list."""
    try:
        return (PREFERRED_KERNEL_ORDER.index(k.name), k.name)
    except ValueError:
        # Fallback for kernels not in the preferred order
        return (len(PREFERRED_KERNEL_ORDER), k.name)


def _available_kernels() -> list[KernelSpec]:
    """
    Query `jupyter_client` for installed kernel specifications on the host system.
    Only returns kernels whose name starts with "xcpp".
    
    Provides a hardcoded fallback list if `jupyter_client` fails or isn't installed.
    """
    try:
        from jupyter_client.kernelspec import KernelSpecManager
        specs = KernelSpecManager().get_all_specs()
        kernels = [
            KernelSpec(
                name=name,
                display_name=spec.get("spec", {}).get("display_name", name),
                language=spec.get("spec", {}).get("language"),
            )
            for name, spec in specs.items()
            if name.startswith("xcpp")
        ]
        return sorted(kernels, key=_sort_key)
    except Exception:
        # Fallback if jupyter_client can't enumerate specs
        return [
            KernelSpec(name="xcpp17", display_name="C++17", language="c++"),
            KernelSpec(name="xcpp14", display_name="C++14", language="c++"),
            KernelSpec(name="xcpp11", display_name="C++11", language="c++"),
        ]


@router.get("/kernels", response_model=list[KernelSpec])
async def list_kernels() -> list[KernelSpec]:
    """
    GET /api/notebooks/kernels
    Return a list of available C++ kernel specifications.
    """
    return _available_kernels()
