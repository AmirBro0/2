"""Start the complete project on localhost, including first-run configuration."""

import argparse
import os
from pathlib import Path
import secrets
import sys


ROOT = Path(__file__).resolve().parent


def prepare_environment(root: Path) -> bool:
    """Create a local configuration once; never replace an existing .env."""
    destination = root / ".env"
    if destination.exists():
        return False
    template = (root / ".env.example").read_text(encoding="utf-8")
    settings = []
    for line in template.splitlines():
        if line.startswith("API_KEY="):
            line = f"API_KEY={secrets.token_urlsafe(32)}"
        elif line.startswith("DEMO_KEY_ENABLED="):
            line = "DEMO_KEY_ENABLED=1"
        settings.append(line)
    try:
        with destination.open("x", encoding="utf-8", newline="\n") as output:
            output.write("\n".join(settings) + "\n")
    except FileExistsError:
        return False
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535")
    if sys.version_info < (3, 12):
        raise SystemExit("Python 3.12 or newer is required")
    try:
        import uvicorn
        import dotenv  # noqa: F401 -- uvicorn needs it for env_file
    except ImportError:
        raise SystemExit("Install dependencies first: python -m pip install -r requirements.txt")

    os.chdir(ROOT)
    if prepare_environment(ROOT):
        print("Created .env for localhost. Temporary login key: test", flush=True)
    print(f"Open http://127.0.0.1:{args.port}/", flush=True)
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=args.port,
        workers=1,
        env_file=str(ROOT / ".env"),
    )


if __name__ == "__main__":
    main()
