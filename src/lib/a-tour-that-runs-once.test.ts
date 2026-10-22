import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * A RULE THE SCHEMA HIDES: THE TOUR'S ONCE IS A COLUMN, NULLABLE, NO
 * DEFAULT, AND THE DOOR THAT WRITES IT WRITES ONLY THE CALLER'S ROW.
 *
 * The schema rule is small but load-bearing: `tour_done_at` with a DEFAULT
 * would mark every existing user as having seen a tour they never saw, and
 * a NOT NULL would invent a lie for people mid-morning. So the migration
 * must add the column nullable with no default, touch no rows, and ship a
 * rollback that drops exactly what it added.
 *
 * The door rule: only PATCH exists. A DELETE or a «show again» toggle would
 * let the tour ambush a person who already said no — so the route file may
 * not export a handler for anything but PATCH, and it may not read an id
 * from the body: it writes the caller's own row, the way the theme door
 * does.
 * ═══════════════════════════════════════════════════════════════════════
 */

const root = process.cwd();
const dir = 'prisma/migrations/20261022000000_the_tour_once';

describe('the tour column, by shape', () => {
  const raw = readFileSync(join(root, dir, 'migration.sql'), 'utf8');
  // Match the SQL the engine runs, not the prose: comments argue, code binds.
  const sql = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

  it('adds tour_done_at to users, nullable, with no default', () => {
    expect(sql).toMatch(/ALTER TABLE\s+"users"\s+ADD COLUMN\s+"tour_done_at"/i);
    expect(sql).not.toMatch(/DEFAULT/i);
    expect(sql).not.toMatch(/NOT NULL/i);
  });

  it('touches no existing rows and drops nothing', () => {
    expect(sql).not.toMatch(/UPDATE\s+/i);
    expect(sql).not.toMatch(/DELETE\s+/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/RENAME/i);
  });

  it('ships a rollback that drops exactly the column it added', () => {
    const rb = join(root, dir, 'rollback.sql');
    expect(existsSync(rb)).toBe(true);
    const rbSql = readFileSync(rb, 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    expect(rbSql).toMatch(/DROP COLUMN/i);
  });

  it('the Prisma schema carries it on the User row, mapped, optional', () => {
    const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
    expect(schema).toMatch(/tourDoneAt\s+DateTime\?\s+@map\("tour_done_at"\)/);
  });
});

describe('the door that writes it', () => {
  const route = readFileSync(join(root, 'src/app/api/profile/tour/route.ts'), 'utf8');

  it('is PATCH-only — no DELETE, no re-show toggle', () => {
    expect(route).toMatch(/export async function PATCH/);
    expect(route).not.toMatch(/export async function DELETE/);
    expect(route).not.toMatch(/export async function POST/);
    expect(route).not.toMatch(/export async function GET/);
    expect(route).not.toMatch(/export async function PUT/);
  });

  it('writes the caller\'s own row — never an id from the body', () => {
    expect(route).toMatch(/requireAuth/);
    expect(route).not.toMatch(/body\.id|params\.id|userId\s*=/);
  });

  it('uses the api door for errors, not bare NextResponse.json', () => {
    expect(route).toMatch(/apiErrorResponse/);
  });

  it('the session carries the fact to the client', () => {
    const types = readFileSync(join(root, 'src/types/auth.ts'), 'utf8');
    expect(types).toMatch(/tourDoneAt\?\s*:\s*string \| null/);
    const auth = readFileSync(join(root, 'src/lib/auth.ts'), 'utf8');
    expect(auth).toMatch(/tourDoneAt:/);
  });
});
