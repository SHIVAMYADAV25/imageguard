// Takedown drafts. These are DRAFTS for the person to read, edit and send: nothing is sent
// automatically. Drafts reference URLs only: they never include or describe the image itself.
// NOT LEGAL ADVICE. Statutory references were checked against public sources in Oct 2026, but
// have the text reviewed by a lawyer / helpline before relying on it in a dispute.
import { CaseFile, CaseUrl } from './types';

export type DraftKind = 'intermediary' | 'dmca' | 'search_engine';

const header = (c: CaseFile, u: CaseUrl) => `Case reference: ${c.id}${u.verification ? `\nOur verification: ${u.verification.matchType} (score ${u.verification.score}) on ${u.verification.checkedAt}` : ''}`;

export function draftTakedown(c: CaseFile, u: CaseUrl, kind: DraftKind = 'intermediary'): { text: string; basis: string[]; channel: string } {
  if (kind === 'search_engine') return searchEngine(c, u);
  if (kind === 'dmca') return dmca(c, u);
  if (c.jurisdiction === 'IN') return india(c, u);
  if (c.jurisdiction === 'US') return usa(c, u);
  return generic(c, u);
}

function india(c: CaseFile, u: CaseUrl) {
  const text = `To: The Grievance Officer / Designated Contact, [PLATFORM NAME]
Subject: Complaint under Rule 3(2)(b), IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021: non-consensual intimate imagery

${header(c, u)}

I, [FULL NAME], am the person depicted in the content at the URL below [OR: I am the authorised representative of the person depicted, authority attached].

URL: ${u.url}

This content [SELECT ALL THAT APPLY: exposes my private area(s) / shows me in full or partial nudity / shows me in a sexual act or conduct / is a morphed or artificially generated image made to appear to be me]. It was published without my consent.

Under Rule 3(2)(b) I request that you remove or disable access to this content within 24 hours of receiving this complaint, and that you:
  1. acknowledge this complaint in writing with a ticket number;
  2. remove or block identical copies on your service, not only this single URL (the Delhi High Court has held that intermediaries must remove the offending content itself and not just the links a victim lists; verify the citation with counsel: "Mrs X v. Union of India", 2023);
  3. preserve the associated account / upload data for law-enforcement requests.

I have also lodged / will lodge a complaint on the National Cybercrime Reporting Portal (cybercrime.gov.in). Reference: [NCRP ACKNOWLEDGEMENT NO. IF ANY].
If this complaint is not resolved within the prescribed period I will escalate to the Grievance Appellate Committee (gac.gov.in).

Contact: [EMAIL / PHONE]
Date: [DATE]        Signature: [NAME]
`;
  return { text, channel: 'Grievance Officer (IT Rules 2021, Rule 3(2)(b))', basis: ['IT Rules 2021 Rule 3(2)(b): removal within 24h of complaint', 'MeitY NCII SOP (late 2025)'] };
}

function usa(c: CaseFile, u: CaseUrl) {
  const text = `To: [PLATFORM] Designated Agent / Removal Request Channel
Subject: TAKE IT DOWN Act removal request: nonconsensual intimate visual depiction

${header(c, u)}

1. Identification of the content and information to locate it:
   ${u.url}

2. Statement: I have a good-faith belief that the intimate visual depiction at the URL above is not consensual (including, where relevant: [e.g. it was shared by a former partner / it is a digitally forged or AI-generated depiction of me / I never agreed to publication]).

3. I am the identifiable individual depicted [OR: an authorised person acting on their behalf; authorisation attached].

4. Contact information: [NAME, EMAIL, PHONE]

5. Signature (physical or electronic): [FULL NAME]      Date: [DATE]

Under the TAKE IT DOWN Act a covered platform must remove the content within 48 hours of a valid request and make reasonable efforts to remove known identical copies. Please confirm receipt and provide a request/ticket number so the matter can be tracked.
`;
  return { text, channel: 'Platform TAKE IT DOWN Act request', basis: ['TAKE IT DOWN Act (US): 48-hour removal on valid request, enforced by the FTC since 19 May 2026'] };
}

function generic(c: CaseFile, u: CaseUrl) {
  const text = `To: [PLATFORM / HOST] Trust & Safety / Abuse
Subject: Request to remove non-consensual intimate imagery

${header(c, u)}

I am the person depicted in the content at: ${u.url}
It was published without my consent and violates your policy on non-consensual intimate imagery. Please remove it, remove identical copies, preserve account/upload records, and confirm with a ticket number.

[If you know the local law that applies (e.g. UK Online Safety Act 2023 offences; Australia's Online Safety Act / eSafety Commissioner), cite it here.]

Contact: [EMAIL]     Date: [DATE]     Name: [FULL NAME]
`;
  return { text, channel: 'Platform trust & safety', basis: ['Platform NCII policy'] };
}

function dmca(c: CaseFile, u: CaseUrl) {
  const text = `To: [PLATFORM] Designated DMCA Agent
Subject: DMCA takedown notice (17 U.S.C. 512(c)(3))

${header(c, u)}

Copyrighted work: a photograph/video that I authored, [DESCRIBE NEUTRALLY, e.g. "a self-portrait taken by me on [DATE]"].
Infringing material located at: ${u.url}

I have a good-faith belief that this use is not authorised by me, my agent, or the law.
The information in this notice is accurate, and under penalty of perjury I am the owner (or authorised to act for the owner) of the exclusive right allegedly infringed.

Contact: [NAME, ADDRESS, EMAIL, PHONE]
Signature: [FULL NAME]      Date: [DATE]
`;
  return { text, channel: 'DMCA agent', basis: ['DMCA 512(c)(3): only if YOU took/own the image. Note: the sender\'s contact details may be forwarded to the poster.'] };
}

function searchEngine(c: CaseFile, u: CaseUrl) {
  const text = `Search-engine de-listing (not a message: use the form)
${header(c, u)}

Google: https://support.google.com/websearch/answer/9116649   (non-consensual explicit / involuntary fake imagery)
Paste this URL into the form: ${u.url}
Also list the results/search queries that surface it. De-listing removes it from Search, not from the website itself: pair it with the site report.
`;
  return { text, channel: 'Google Search removal form', basis: ['Search-engine policy on non-consensual explicit imagery'] };
}
