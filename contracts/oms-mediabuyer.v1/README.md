# `oms-mediabuyer.v1` — what the OMS answers the media buyer

**The source of truth is HERE, in the OMS.** The media buyer
(`zaki-mediabuyer`) keeps a verbatim copy in its own `contracts/oms-mediabuyer.v1/`
and tests its adapter against it. A change is made here first, then copied
across unchanged.

| File | What |
|---|---|
| `attribution-page.schema.json` | `GET /api/v1/orders/attribution` — one page `{items, next_cursor}` |
| `attribution-page.example.json` | a golden page |
| `products-page.schema.json` | `GET /api/v1/products?fields=…` — the optional fields the media buyer asks for |
| `products-page.example.json` | a golden catalogue |

## The rules

- **Read only.** Both endpoints are `GET`; the key's scopes are
  `orders.attribution.read`, `products.read`, `products.costs.read`, and
  nothing on the path writes (`src/lib/v1/the-media-buyer-cannot-write.test.ts`).
- **No customer.** No name, phone, address — not in any field, not under any
  name. `capi_ref` is null or an opaque `enc:` reference, never a readable phone.
- **Bounded.** `updated_since` required and at most 31 days back, `limit` ≤ 200,
  cursor paging, 30 calls a minute on the media buyer's key.
- **Stopping the key stops it.** A revoked or expired key is refused on the
  next request (401 `TOKEN_INVALID`).
- **v1 grows, never changes.** Adding an optional field is v1 (update the
  schema here, copy it across). Removing, renaming or retyping a field is v2.

## What enforces it

OMS: `src/lib/v1/the-media-buyers-door.test.ts` (golden files and live
handler answers validate, «the frozen contract») · `the-media-buyer-cannot-write.test.ts`.
Media buyer: `tests/oms-contract.test.ts`.
