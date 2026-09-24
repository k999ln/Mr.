# templates/

Launchd plist templates that `install.sh` copies into
`~/Library/LaunchAgents/` after substituting the user's `$HOME` and
`$ANICCA_HOME` paths.

These templates are retained only to remove or inspect older installations. New
installations use `apps/life-manager/server.js` for both Telegram and the voice
bridge and must not install a second Telegram/Pipecat daemon.

- `ai.anicca.tg-loc-bot.plist`  → the Telegram Live-Location bot that
  writes `~/.openclaw/state/location/<user_id>.json`. Every cron tick
  of `anicca-rockstar_ibot` reads from those files.
- `ai.anicca.pipecat-phone.plist`  → the Pipecat outbound voice daemon
  (Twilio + Gemini Live native S2S) that receives the `/dialout` POST
  from `lateness_check.py` and places the phone call.

Both legacy templates have `KeepAlive=true`; installing them alongside the Core
would recreate the duplicate-owner problem, so the current installer does not
activate them.

The `__HOME__` and `__ANICCA_HOME__` tokens are preserved for historical
inspection only. Do not bootstrap these templates; the labels are listed in
`config/loop-registry.json` under `retired_labels`.
