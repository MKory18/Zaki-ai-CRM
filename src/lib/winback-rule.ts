import { updateCompanySettings } from './company-settings';
import { db } from './db';
import { DEFAULT_WINBACK_RULE, parseWinbackRule, type WinbackRule } from './winback';

/**
 * WHERE THE OWNER'S RULE LIVES: `Company.settings.winback`.
 *
 * No new column and no migration — the settings document already holds one key
 * per feature (the AI, the message templates, the performance bars), written
 * under a row lock so two saves cannot overwrite each other.
 *
 * What is read is always a VALID rule: a missing key is the default, a broken
 * document is the default, and a stored value out of bounds is clamped
 * (`parseWinbackRule`). The list and the offer both read this, so the two can
 * never apply different rules to the same order.
 */
export async function winbackRule(companyId: string): Promise<WinbackRule> {
  const company = await db.company.findUnique({ where: { id: companyId }, select: { settings: true } });
  try {
    return parseWinbackRule((company?.settings ? JSON.parse(company.settings) : {}).winback);
  } catch {
    // A broken settings blob must not take the list down.
    return { ...DEFAULT_WINBACK_RULE, reasons: [...DEFAULT_WINBACK_RULE.reasons] };
  }
}

/** Only this key, under a row lock — never the whole document from a read another save may have overtaken. */
export async function saveWinbackRule(companyId: string, rule: WinbackRule): Promise<WinbackRule> {
  await updateCompanySettings<WinbackRule>(companyId, 'winback', () => ({ ...rule, reasons: [...rule.reasons] }));
  return rule;
}
