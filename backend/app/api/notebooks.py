"""
Notebooks router — lightweight, filesystem-based.
The only endpoint the frontend actively needs is /kernels.
All notebook CRUD is handled via the /api/fs endpoints + local .cpynb files.
"""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/notebooks", tags=["notebooks"])

PREFERRED_KERNEL_ORDER = ("xcpp17", "xcpp14", "xcpp11")


class KernelSpec(BaseModel):
    name: str
    display_name: str
    language: str | None = None


def _sort_key(k: KernelSpec):
    try:
        return (PREFERRED_KERNEL_ORDER.index(k.name), k.name)
    except ValueError:
        return (len(PREFERRED_KERNEL_ORDER), k.name)


def _available_kernels() -> list[KernelSpec]:
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
    return _available_kernels()
