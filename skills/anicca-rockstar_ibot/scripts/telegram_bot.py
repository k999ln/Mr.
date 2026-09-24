#!/usr/bin/env python3
"""Retired compatibility entrypoint for the former long-polling Telegram bot.

Telegram is owned by the Rockstar_ibot Core webhook in apps/rockstar_ibot/server.js.
Keeping a second polling implementation would split state and can conflict with the
webhook when both processes use the same BotFather token, so this legacy entrypoint
fails closed instead of starting another bot.
"""

import sys


def main() -> int:
    print(
        "The legacy Telegram polling bot is retired. "
        "Run apps/rockstar_ibot/server.js and configure its /telegram webhook.",
        file=sys.stderr,
    )
    return 78


if __name__ == "__main__":
    raise SystemExit(main())
