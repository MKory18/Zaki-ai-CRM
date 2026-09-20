---
name: crm-oms-guard
description: Enforces the CRM+OMS architecture contract on an existing Next.js + Prisma COD operations system. Use this skill for ANY work on this repository — adding a screen, changing a route, touching orders, inventory, shipments, settlement, wallets, commission, landing pages, permissions, or scheduled jobs. It supplies the fixed navigation map, the role visibility matrix, the non-negotiable business rules, the staged delivery order, and the anti-duplication protocol that prevents rebuilding backend services that already exist. Trigger it before writing code, not after.
---

# CRM + OMS — Architecture Guard

You are extending an EXISTING production system with live financial data.
What the backend already does is authoritative, but it covers far less
than the contract: see the verified present / absent lists in
`references/anti-duplication.md` and the revised order in
`references/stages.md`. Backend and frontend are built stage by stage
against a fixed contract. You do not improvise.

## The five rules that govern every turn

1. **Inspect before you write.** Search by MEANING, not by name. A service
   that exists under a different name is still that service.
2. **Extend, never fork.** If it exists, add to it in place. Creating a
   parallel field, table, service or screen doing the same job is a defect.
3. **Report conflicts, do not resolve them.** If existing behaviour
   contradicts the contract, stop and report. Live data depends on it.
4. **Enforce in the service layer.** Hiding a control in the UI is not
   enforcement. Every guard has a negative test.
5. **One stage at a time.** Do not open the next stage before the current
   one is approved.

## Before writing any code

Run the anti-duplication protocol in `references/anti-duplication.md`
and produce its verdict table. You may only build what you marked
GENUINELY NEW, and only after the user approves that list.

## Which reference to read, when

| You are about to… | Read |
|---|---|
| Add or move a screen, route or menu item | `references/architecture.md` |
| Touch orders, stock, money, states, COD, discounts | `references/invariants.md` |
| Start any new phase of work | `references/stages.md` |
| Declare something missing | `references/anti-duplication.md` |
| Finish a stage | `references/checklists.md` |

Read the reference that applies. Do not guess its contents from this file.

## Hard stops — refuse and report instead of proceeding

- Adding a `zone` column. Zone is derived: `getZone(state)`. Nothing else.
- Deleting an order or a financial record. VOID and reversing entries only.
- Letting the moderator role reach the confirmation queue.
- Computing COD, delivery fee, commission, profit, available stock, days
  in transit or SLA anywhere in frontend code.
- Adding a core order state. User additions are sub-statuses.
- Posting a fund movement before settlement approval.
- A destructive migration without an explicit instruction.
- Building a second landing page system, scheduler, note model or
  reservation table when one already exists under another name.

## Output shape for every task

1. Discovery table: `CONCEPT | FOUND AS | FILE PATH | VERDICT`
2. Route map: `path | screen | roles allowed` (when routes change)
3. Files deleted
4. Migration plus rollback, if any
5. Service-layer code and guard functions
6. UI code
7. Tests, including a negative test for every guard

Nothing else. No commentary between sections.

## Model guidance

Architecture, discovery, and anything touching inventory or money:
use the stronger model. Repetitive screen implementation and bug fixes:
use the faster model. Plan first, approve, then execute.
