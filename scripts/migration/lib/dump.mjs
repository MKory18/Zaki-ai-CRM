// Parser for the phpMyAdmin/MariaDB SQL dump of the legacy "Salah Plus" store.
// Reads the dump file only — no live MySQL connection needed; the dump IS the
// source of truth for the old data.
import fs from 'fs';

export function loadDump(path) {
  return fs.readFileSync(path, 'utf8');
}

function m2cols(s) {
  return s.split(',').map((c) => c.trim().replace(/`/g, ''));
}

function parseTuple(text, i) {
  i++; // consume '('
  const vals = [];
  let cur = '', inStr = false, q = '';
  while (i < text.length) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') {
        const e = text[i + 1];
        cur += { n: '\n', r: '\r', t: '\t' }[e] ?? e;
        i += 2;
        continue;
      }
      if (c === q) {
        if (text[i + 1] === q) { cur += q; i += 2; continue; }
        inStr = false; i++; continue;
      }
      cur += c; i++; continue;
    }
    if (c === "'" || c === '"') { inStr = true; q = c; i++; continue; }
    if (c === ',') { vals.push(cur.trim()); cur = ''; i++; continue; }
    if (c === ')') { vals.push(cur.trim()); return [vals, i + 1]; }
    cur += c; i++;
  }
  return [vals, i];
}

/** Iterate every row of a table in the dump as {col: value}. Values stay strings; 'NULL' → null. */
export function* tuples(text, table) {
  const re = new RegExp(`INSERT INTO \\\`${table}\\\` \\(([^)]*)\\) VALUES`, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const cols = m2cols(m[1]);
    let i = text.indexOf('(', re.lastIndex);
    const stmtEnd = text.indexOf(';\n', re.lastIndex);
    while (i !== -1 && i < stmtEnd) {
      const [vals, next] = parseTuple(text, i);
      const row = {};
      cols.forEach((c, j) => { row[c] = vals[j] === 'NULL' ? null : vals[j]; });
      yield row;
      i = text.indexOf('(', next);
    }
    re.lastIndex = stmtEnd + 1;
  }
}

export function rows(text, table) {
  return [...tuples(text, table)];
}

/** Parse "YYYY-MM-DD HH:MM:SS" (dump timestamps are UTC per dump header) → Date */
export function dt(s) {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

/** Parse MySQL SET('a','b') column value → array */
export function setVals(s) {
  if (!s) return [];
  return s.split(',').map((x) => x.trim());
}
