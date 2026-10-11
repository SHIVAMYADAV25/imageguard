// Evidence export for a helpline, lawyer or police. Contains metadata only: no images.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { CaseFile } from './types';
import { verifyChain, isOverdue } from './store';

export function exportEvidence(c: CaseFile): string {
  const chain = verifyChain(c);
  const last = c.events[c.events.length - 1];
  const L: string[] = [];
  L.push(`# Evidence summary: ${c.title}`, '', `- Case ID: \`${c.id}\``, `- Created: ${c.createdAt}`, `- Jurisdiction: ${c.jurisdiction}`);
  L.push(`- Original image SHA-256: \`${c.fingerprint.sha256}\``, `- PDQ-style hash: \`${c.hashPackage.hash}\``);
  L.push(`- Ledger integrity: **${chain.ok ? 'VALID' : `BROKEN at event ${chain.brokenAtSeq}`}** (${c.events.length} events; head hash \`${last?.hash}\`)`, '');
  L.push('> This file contains no images. URLs were verified by comparing perceptual hashes and embeddings against the stored fingerprint of the original. A verification is evidence, not a legal determination.', '');
  L.push('## Tracked URLs', '', '| ID | Status | URL | Match | Reports |', '|---|---|---|---|---|');
  for (const u of c.urls) {
    const reps = u.reports.map((r) => `${r.channel} @ ${r.submittedAt}${r.reference ? ` (ref ${r.reference})` : ''} -> ${r.response ? r.response.outcome : isOverdue(r) ? 'OVERDUE' : 'awaiting'}`).join('<br>') || '-';
    L.push(`| ${u.id} | ${u.status} | ${u.url} | ${u.verification ? `${u.verification.matchType} (${u.verification.score})` : '-'} | ${reps} |`);
  }
  L.push('', '## Timeline', '');
  for (const e of c.events) L.push(`${e.seq}. \`${e.at}\` **${e.type}** ${JSON.stringify(e.data)}`);
  const out = path.join(config.dataDir, 'cases', `${c.id}-evidence.md`);
  fs.writeFileSync(out, L.join('\n'));
  return out;
}
