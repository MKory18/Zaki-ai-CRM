# `contracts/` — copies, never sources

Everything under this directory is a **verbatim copy** of a contract that
lives somewhere else. It is here so this repository's tests can prove it
keeps its side of the bargain — not so anybody can change the bargain.

## `oms-app-events.v1/`

Copied from **`MKory18/AIresponse`** → `contracts/oms-app-events.v1/`, which
is the source of truth. System 7 (the replies system) reads this repository's
six app events through a signed webhook, and those files say exactly what it
expects: a draft-07 `schema.json`, one golden body per event, and
`signed-delivery.json` — a real signed delivery with its secret and the
signature it must produce.

### The rule

**Never edit these files here.** A change belongs on `AIresponse`, and then
it is copied down. Editing the copy makes this repository's tests agree with
a contract nobody else holds — which is worse than having no tests, because
it reads like proof.

### What enforces the contract

`src/lib/apps/events.test.ts`, section «the contract the replies system
reads»: `APP_EVENTS` equals the schema's enum, `signPayload` reproduces
`signature_example` byte for byte, `emitAppEvent` queues exactly
`{event, at, data}`, `deliverOne` sends the four headers over `"ts.body"`
with the body unchanged, and every golden body validates.

`src/lib/apps/contract.ts` reads these files and validates against them. It
is **not application code** — nothing ships it, the same arrangement
`src/lib/guard-source.ts` has.
