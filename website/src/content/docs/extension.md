---
title: Pi extension
description: Load the extension and use the /sessions command.
---

## Load from a checkout

From the repository root, with Pi available:

```sh
pi -e ./src/extension/index.ts
```

Then enter:

```text
/sessions
```

The command opens a read-only list using the same discovery and formatting as the
CLI. Select **Close** to dismiss it. It does not inject inventory into model context,
control other sessions, or publish lifecycle status.

The extension uses Node-compatible APIs and is typechecked against Pi **0.85.1**.
Other host versions are unverified. Live discovery still requires Linux.

## Persistent installation

To register the checkout with Pi:

```sh
pi install /absolute/path/to/pi-session-info
```

Replace the placeholder with your checkout path, then reload or restart Pi.
Running the CLI or building the documentation does not install the extension.

## Command behavior

- `/sessions` accepts no arguments; extra text produces a usage warning.
- Without an interactive UI, the command returns without displaying an inventory.
- Discovery errors produce a notification rather than changing the conversation.
- Multiple inspectable processes in the same working directory remain separate rows.

## Limitations

Loading this extension does not make model, activity, session identity, or tools
known. A registry publisher and lifecycle integration are future milestones.
