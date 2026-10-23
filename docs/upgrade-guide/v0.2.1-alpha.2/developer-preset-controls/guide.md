---
kind: upgrade-guide
description: Disabling Developer tools hides preset controls and resets the new-task default to Standard.
---

# Agent presets require Developer tools

English | [中文](guide.zh.md)

## Change

With `ui-settings.enabled: false`, the new-session picker, session-header mode label, Agent presets settings section, and Creator entry are hidden. A local connection resets all non-Standard new-task defaults to Standard, including Creator and custom presets. Previously, Creator and custom defaults and controls remained available. Existing sessions keep their modes.

## Migration

1. To use preset controls, enable **Show coding view** in General Settings (called **Developer mode** in TP Cowork), which saves `ui-settings.enabled: true`.
2. Open **Agent presets** to choose a default again if it was reset. Re-enabling Developer tools restores the controls without restoring the old default.
3. Create a new session and confirm its preset. Existing sessions retain their recorded presets.
