// Case management CLI. Typical flow:
//   npm run case -- new --image me.jpg --title "My case" --jurisdiction IN
//   npm run case -- add-url --case <id> --url https://...
//   npm run case -- verify --case <id>
//   npm run case -- draft  --case <id> --url-id u1 [--kind intermediary|dmca|search_engine]
//   npm run case -- report --case <id> --url-id u1 --channel "Platform grievance officer" [--ref TICKET]
//   npm run case -- respond --case <id> --url-id u1 --outcome removed|rejected|no_response|info_requested
//   npm run case -- recheck --case <id>
//   npm run case -- status --case <id>        |  export --case <id>  |  list
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config } from './config';
import { addUrl, appendEvent, isOverdue, listCases, loadCase, recheck, recordReport, recordResponse, saveCase, verifyChain, verifyUrl, createCase } from './cases/store';
import { draftTakedown, DraftKind } from './cases/takedown';
import { exportEvidence } from './cases/export';
import { Jurisdiction } from './cases/types';

const need = <T>(v: T | undefined, name: string): T => { if (v === undefined) { console.error(`Missing --${name}`); process.exit(2); } return v; };

export function printStatus(id: string) {
  const c = loadCase(id);
  const chain = verifyChain(c);
  console.log(`\nCase ${c.id}  "${c.title}"  [${c.jurisdiction}]  ledger: ${chain.ok ? 'valid' : 'BROKEN'}  (${c.events.length} events)`);
  console.log('ID   STATUS      MATCH                    URL');
  for (const u of c.urls) {
    const m = u.verification ? `${u.verification.matchType} ${u.verification.score}` : '-';
    console.log(`${u.id.padEnd(4)} ${u.status.padEnd(11)} ${m.padEnd(24)} ${u.url}`);
    for (const r of u.reports) {
      const state = r.response ? r.response.outcome : isOverdue(r) ? 'OVERDUE' : 'awaiting reply';
      console.log(`       -> ${r.channel}${r.reference ? ` (ref ${r.reference})` : ''}: ${state}${r.deadlineAt && !r.response ? `  deadline ${r.deadlineAt}` : ''}`);
      if (isOverdue(r)) console.log(`          ESCALATE: ${c.jurisdiction === 'IN' ? 'Grievance Appellate Committee (gac.gov.in) + cybercrime.gov.in' : c.jurisdiction === 'US' ? 'file a complaint with the FTC (TAKE IT DOWN Act)' : 'platform appeals / local regulator / helpline'}`);
    }
  }
}

async function main() {
  const { positionals, values: v } = parseArgs({
    allowPositionals: true,
    options: { image: { type: 'string' }, title: { type: 'string' }, jurisdiction: { type: 'string' }, case: { type: 'string' }, url: { type: 'string' }, 'url-id': { type: 'string' },
      kind: { type: 'string' }, channel: { type: 'string' }, ref: { type: 'string' }, outcome: { type: 'string' }, note: { type: 'string' } },
  });
  const cmd = positionals[0];
  switch (cmd) {
    case 'new': {
      const img = fs.readFileSync(need(v.image, 'image'));
      const c = await createCase(img, v.title ?? 'Untitled case', (v.jurisdiction ?? 'OTHER') as Jurisdiction);
      console.log(`Created ${c.id}\nPDQ-style hash: ${c.hashPackage.hash}\nThe image itself was NOT stored.`);
      console.log('\nIMPORTANT: this hash protects nothing by itself. To make participating platforms block the image, create the hash on https://stopncii.org/ (it runs on your device; for videos also hash a few screenshots).');
      break;
    }
    case 'list': for (const c of listCases()) console.log(`${c.id}  ${c.title}  [${c.jurisdiction}]  ${c.urls.length} urls`); break;
    case 'add-url': { const c = loadCase(need(v.case, 'case')); const u = addUrl(c, need(v.url, 'url')); console.log(`Tracking ${u.id}: ${u.url}`); break; }
    case 'verify': {
      const c = loadCase(need(v.case, 'case'));
      for (const u of c.urls.filter((x) => !v['url-id'] || x.id === v['url-id'])) { await verifyUrl(c, u); console.log(`${u.id}: ${u.status}  ${u.lastCheck?.note}`); }
      break;
    }
    case 'draft': {
      const c = loadCase(need(v.case, 'case')); const u = c.urls.find((x) => x.id === need(v['url-id'], 'url-id'));
      if (!u) throw new Error('unknown url-id');
      const d = draftTakedown(c, u, (v.kind ?? 'intermediary') as DraftKind);
      const out = path.join(config.dataDir, 'cases', `${c.id}-${u.id}-${v.kind ?? 'intermediary'}.txt`);
      fs.writeFileSync(out, d.text);
      console.log(`${d.text}\n---\nDraft saved: ${out}\nBasis: ${d.basis.join('; ')}\nReview and edit the [PLACEHOLDERS]. Nothing was sent.`);
      break;
    }
    case 'report': {
      const c = loadCase(need(v.case, 'case')); const u = c.urls.find((x) => x.id === need(v['url-id'], 'url-id'));
      if (!u) throw new Error('unknown url-id');
      const r = recordReport(c, u, need(v.channel, 'channel'), [], v.ref);
      console.log(`Recorded report ${r.id}${r.deadlineAt ? `; statutory clock ends ${r.deadlineAt}` : ''}`);
      break;
    }
    case 'respond': {
      const c = loadCase(need(v.case, 'case')); const u = c.urls.find((x) => x.id === need(v['url-id'], 'url-id'));
      if (!u) throw new Error('unknown url-id');
      recordResponse(c, u, need(v.outcome, 'outcome') as any, v.note); console.log('Recorded.'); break;
    }
    case 'recheck': { const c = loadCase(need(v.case, 'case')); for (const r of await recheck(c)) console.log(`${r.id}: ${r.before} -> ${r.after}  (${r.note})`); break; }
    case 'status': printStatus(need(v.case, 'case')); break;
    case 'export': { const c = loadCase(need(v.case, 'case')); appendEvent(c, 'evidence_exported', {}); saveCase(c); console.log(`Evidence written: ${exportEvidence(c)}`); break; }
    default: console.log('commands: new | list | add-url | verify | draft | report | respond | recheck | status | export');
  }
}
if (require.main === module) main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
