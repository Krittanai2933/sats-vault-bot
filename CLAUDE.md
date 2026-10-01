# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Discord bot (in Thai) for tipping/raining sats (Bitcoin satoshis) between friends in a server. A single **LNbits wallet acts as the treasury**; each user's balance is tracked as an "internal ledger" in SQLite. Transfers between users (`/tip`, `/rain`) are instant, free, ledger-only moves — no Lightning Network calls. Only `/deposit` and `/withdraw` actually touch the Lightning Network (money entering/leaving the treasury).

## Commands

```bash
pnpm install
pnpm register   # registers slash commands with Discord — run once, and again whenever commands change
pnpm start       # runs the bot (src/index.js)
```

There is no build step, linter, or test suite configured in this repo.

## Environment

Copy `.env.example` to `.env` and fill in:
- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` (optional, comma-separated — guild-scoped commands sync instantly; omit for global, which takes ~1hr to propagate)
- `LNBITS_URL`, `LNBITS_ADMIN_KEY` (spends money — treat as a secret), `LNBITS_INVOICE_KEY` (create invoices / check status only)
- `DB_PATH` (defaults to `./vault.db`)

## Architecture

- **`src/index.js`** — entry point. Dynamically loads every file in `src/commands/` into a `Map` keyed by command name, then dispatches `InteractionCreate` events to the matching command's `execute(interaction)`. Adding a new command = add a new file in `src/commands/` exporting `{ name, execute }` as default — no manual registration needed in `index.js` (but you still need to add it to `register-commands.js` and run `pnpm register`).
- **`src/register-commands.js`** — standalone script (not imported by the bot) that defines slash command schemas (`SlashCommandBuilder`) and pushes them to Discord's API. Must be kept in sync with the command files' expected options.
- **`src/db.js`** — all persistence and ledger logic, using `better-sqlite3` (synchronous, WAL mode). Three tables:
  - `users` — balance per `(guild_id, discord_id)`. **Balances are per-guild** — the same Discord user has an independent balance in each server.
  - `pending_deposits` — tracks in-flight LNbits invoices awaiting payment confirmation, keyed by `checking_id`.
  - `ledger_log` — append-only audit trail of every balance-affecting event (`deposit`/`withdraw`/`tip`/`rain`).
  All balance mutations (`transfer`, `rain`, `withdraw`, `resolveDeposit`) are wrapped in `db.transaction(...)` for atomicity, and throw plain `Error` objects with machine-readable messages (e.g. `INSUFFICIENT_BALANCE`, `SENDER_NOT_JOINED`) that command files pattern-match to produce Thai user-facing text.
- **`src/lnbits.js`** — thin wrapper around our own LNbits instance's REST API (`createInvoice`, `payInvoice`, `checkPayment`, `getTreasuryBalance`). Invoice creation/status checks use the read-only invoice key; paying out uses the admin key.
- **`src/lnurl.js`** — resolves a Lightning Address (`name@domain`) to a BOLT11 invoice via the LNURL-pay protocol, talking directly to the recipient's domain (not our LNbits instance): fetch `/.well-known/lnurlp/<name>`, validate the requested amount against `minSendable`/`maxSendable`, then hit the returned `callback` with the amount to get back a `pr` (invoice).
- **`src/commands/*.js`** — one file per slash command, each default-exporting `{ name, execute }`. Common pattern: guard against DM usage (`interaction.guildId` check), validate input, call into `db.js`/`lnbits.js`, reply. `deposit.js` is the most involved: it generates a QR code (`qrcode` lib) for the invoice and polls LNbits every 4s (up to ~10 min) via `setInterval` to detect payment and credit the user's balance. `join.js` accepts an optional `lnaddress` option to save a Lightning Address on the user's row (`users.ln_address`) as a default withdrawal destination — can also be (re)run later just to update the saved address. `withdraw.js` accepts either a BOLT11 invoice or a Lightning Address in its `destination` option, which is now optional — if omitted, it falls back to the address saved via `/join`; a Lightning Address (explicit or saved) requires the separate `amount` option since (unlike a BOLT11 invoice) it has no amount encoded in it.

## Ledger correctness invariants (important when touching db.js or withdraw/deposit flow)

- Sum of all users' balances (across all guilds) should always be **≤** the actual treasury wallet balance. `/withdraw` charges the user a flat 1% fee reserve (minimum 1 sat, `FEE_RATE`/`FEE_MIN_SATS` in `withdraw.js`) on top of the withdrawn amount to buffer against real Lightning routing fees — this is charged as-is and never refunded even if the actual routing fee turns out cheaper, by design (a deliberate simplicity-over-precision tradeoff, not a bug).
- `/withdraw` pays the real Lightning invoice *first*, then decrements the internal balance (withdrawn amount + fee) — this is a deliberate fail-safe: if the bot crashes between those two steps, the treasury takes a small loss, but a user can never have their balance debited without actually receiving funds.
- The `users` table schema keys on `(guild_id, discord_id)` — this is a deliberate per-guild partition. Don't collapse it to a global-per-user balance without understanding this is a breaking schema change (old `vault.db` files from before this partitioning must be deleted, per the README).
