import { describe, expect, it } from 'vitest';
import { allowedScopes, scopeContext, scopeNoteAr } from './ai-scope';
import { FINANCE_PERMISSION, scopesOf, ASSISTANTS, assistantByKey } from './ai-assistants';

/**
 * THE ASSISTANT IS GIVEN ONLY WHAT THE ASKER MAY SEE.
 *
 * It used to be handed the whole business in one object — revenue, cost of
 * goods, commission, net profit, margin — for anyone holding ai.use, a key
 * granted so people could ask about their own orders. So a confirmation
 * agent could ask how much the company made and be told, including the
 * commission line that is their own pay.
 *
 * The fix is removal, not instruction: a number that is not in the request
 * cannot be talked out of the model, and a prompt saying "do not mention
 * profit" is a request, not a guard.
 */

const CONTEXT = {
  period: 'month',
  total_orders: 100,
  confirmed_orders: 80,
  rejected_orders: 20,
  delivered_orders: 60,
  confirmation_rate: 80,
  delivery_rate: 75,
  revenue: 5000,
  production_cost: 2000,
  shipping_cost: 400,
  commission: 300,
  operational_expenses: 100,
  net_profit: 2200,
  profit_margin: 44,
  top_demanded_product: 'كريم',
  top_profitable_product: 'سيروم',
  top_moderator: 'سارة',
  highest_rejection_product: 'زيت',
};

describe('what reaches the model', () => {
  it('keeps the order figures and drops every money figure', () => {
    const { context, removed } = scopeContext(CONTEXT, ['orders']);
    expect(context.total_orders).toBe(100);
    expect(context.confirmation_rate).toBe(80);
    // Not merely hidden — absent.
    for (const money of ['revenue', 'net_profit', 'profit_margin', 'commission', 'production_cost', 'shipping_cost', 'top_profitable_product']) {
      expect(money in context, money).toBe(false);
    }
    expect(removed).toContain('finance');
  });

  it('keeps the money when the person may see it', () => {
    const { context, removed } = scopeContext(CONTEXT, ['orders', 'finance', 'team']);
    expect(context.net_profit).toBe(2200);
    expect(context.top_moderator).toBe('سارة');
    expect(removed).toEqual([]);
  });

  it('drops a field nobody classified — silence is not permission', () => {
    // A number added to the context later must not ride along until
    // somebody remembers to classify it. That is how the money got in.
    const { context } = scopeContext({ ...CONTEXT, secret_new_metric: 999 }, ['orders', 'finance', 'team']);
    expect('secret_new_metric' in context).toBe(false);
  });

  it('always keeps the period — it names the window, and is nobody\'s secret', () => {
    const { context } = scopeContext(CONTEXT, []);
    expect(context.period).toBe('month');
    expect(Object.keys(context)).toEqual(['period']);
  });
});

describe('who may see the money', () => {
  const holds = (...keys: string[]) => (p: string) => keys.includes(p);

  it('needs the key that reads financial reports, not the one that opens the assistant', () => {
    expect(allowedScopes(['orders', 'finance'], holds('ai.use'))).toEqual(['orders']);
    expect(allowedScopes(['orders', 'finance'], holds('ai.use', FINANCE_PERMISSION))).toEqual(['orders', 'finance']);
  });

  it('never withholds the non-money scopes', () => {
    expect(allowedScopes(['orders', 'team', 'inventory'], () => false)).toEqual(['orders', 'team', 'inventory']);
  });
});

describe('the answer says what it could not see', () => {
  it('names the missing money rather than answering as if it were whole', () => {
    expect(scopeNoteAr(['finance'])).toContain('المال');
    expect(scopeNoteAr([])).toBeNull();
  });
});

describe('the assistants', () => {
  it('the order extractor reads NOTHING from the database', () => {
    // It is handed a pasted message. A database read here would be the one
    // place a customer's words and the company's numbers could meet.
    expect(assistantByKey('order_intake')!.scopes).toEqual([]);
  });

  it('the picking assistant never carries a phone or an address', () => {
    const picking = assistantByKey('picking')!;
    expect(picking.pii).toBe(false);
    expect(picking.scopes).toEqual(['inventory']);
    expect(picking.scopes).not.toContain('customer');
  });

  it('business intelligence starts at NOTHING, and every scope is the owner\'s decision', () => {
    const bi = assistantByKey('intelligence')!;
    expect(bi.scopes).toEqual([]);
    expect(scopesOf(bi, [])).toEqual([]);
    expect(scopesOf(bi, ['finance'])).toEqual(['finance']);
    // A scope the owner never ticked is never added by asking for it.
    expect(scopesOf(bi, ['orders'])).not.toContain('finance');
  });

  it('every assistant names the permission its asker must hold', () => {
    for (const a of ASSISTANTS) {
      expect(a.needs, a.key).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });
});
