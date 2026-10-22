# Agent Note: PromptHub system-browser authentication

Status: implemented

English | [中文](2026-10-19-prompthub-system-browser-login.zh.md)

## Problem

Desktop sign-in must reuse the user's PromptHub browser session and update the sidebar and skill store together. An isolated Electron website window has no access to that browser session. Opening a website alone supplies no confirmation or credential return path to Desktop.

## Decision

[DesktopTpcoworkHubPlugin](../../../../apps/desktop/src/tpcoworkhub-plugin.ts) starts a temporary listener bound to `127.0.0.1` and opens PromptHub's `/desktop/authorize` page with the system browser. The URL contains the callback address and a fresh random state, never a credential. The website validates that address, reuses its existing session or redirects to its password login page, and requires explicit account confirmation. It posts the token and state as JSON to the local callback. Desktop validates Origin, Host, path and state, limits the request size, and accepts only one confirmation.

The toolbox Host verifies `users:me` before writing the existing endpoint-bound `toolbox-prompthub/session` credentials grant. Sidebar and skill store share that grant, including restart recovery and sign-out. An invalid replacement token preserves the existing grant. Only account details, progress and safe failures reach the application renderer through its primary-document bridge. The browser displays success after Host verification and storage complete.

Success, failure, cancellation and timeout close the listener and its connections. Cancellation before confirmation prevents credential submission; a submission already in progress settles before sign-out or shutdown completes. Closing a browser tab cannot cancel the listener, so the desktop cancellation action and configured timeout own that case.

## Alternatives considered

**An isolated Electron login window** can read the website token without changing the site, but loses the user's browser session and requires repeated password entry. The system browser supplies the requested session reuse.

**Opening the existing login URL without a callback** cannot synchronize Desktop state. The authorization page and local callback supply the missing confirmation and return path without adding a second account service.

**A Desktop password form** duplicates the website authentication flow. PromptHub retains ownership of its login form and authentication policy.

**A separate Desktop token store** creates competing sidebar and skill-store identities. The existing Host grant already owns persistence, endpoint binding and logout. Putting the bearer token in a redirect URL instead of a POST would expose it to address history and URL diagnostics.

## Consequences

The PromptHub website and Desktop must both support this flow; the website integration depends on its token storage key and authenticated user-query protocol. Desktop sign-out preserves the browser's website session, allowing the next sign-in to require only confirmation. Browsers may require permission to connect to the local application. Ordinary Web lacks this private native bridge. DeepSeek account and Platform providers retain their independent protocols.

Native tests exercise callback validation, cancellation, timeout, duplicate submission, rejected credentials and sign-out during a commit. A local smoke uses the actual Vue build, a separate Chrome process, compiled Electron authentication and the Host Gateway to verify password login, existing-session confirmation, restart recovery, shared sign-out and safe failure. The fixture uses temporary browser and credential directories; deployed website authentication remains a separate deployment check.
