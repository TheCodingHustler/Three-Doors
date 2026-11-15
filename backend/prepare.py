"""Print the internal preparation URL and saved state for the hackathon clinic."""
import argparse
from . import catalog, prepared


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=5175)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Invalid local web port")
    cached = prepared.PreparedStore().load(catalog.DEMO_ID, "step-free")
    print("7440 Cypress Creek Pky, Houston · step-free & wheelchair access")
    print("Saved review: " + (f"{cached['reviewedViews']} views, version {cached['versionId']}" if cached else "not prepared"))
    print(f"Open http://localhost:{args.port}/?prepare=houston-step-free")
    print("Leave that tab open; it runs the SDK capture pass automatically and publishes only after every planned view finishes.")


if __name__ == "__main__":
    main()
