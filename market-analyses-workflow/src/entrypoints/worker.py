"""Point d'entrée du worker : découvre les workflows et démarre le worker."""

import asyncio


async def main() -> None:
    try:
        from mistralai.workflows import discover_workflows, run_worker
    except ImportError:
        from mistralai_workflows import discover_workflows, run_worker  # type: ignore

    discovered = discover_workflows()
    await run_worker(discovered)


if __name__ == "__main__":
    asyncio.run(main())
