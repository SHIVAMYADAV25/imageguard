# Real documented cases, and what this toolkit would (and would not) have given the person

Facts below come from public reporting and legal commentary (sources at the end). Where we describe what the toolkit "would" do, that is **our mapping, not a claim about what these people used**.

> **Why the tests use stand-in photos, not real victims' images.** Real intimate or abusive images of real people must never be used as test data: it re-victimises them, and nothing in this toolkit needs it. Hashing, the upload gate, URL verification, takedown tracking and the ledger behave identically on *any* image, so rehearsing with an ordinary photo (or your own, as a consenting adult) proves the same logic. `npm run demo` and `npm run testpack` are built for exactly this.

## Case 1: Noelle Martin (Australia): discovery by reverse-image search
- **What happened:** at 18 (around 2013) she ran a reverse-image search on an ordinary selfie and found her photos edited onto pornographic images on many sites. She emailed the webmaster of site after site; it got harder as the images spread. Police told her no law covered it at the time. She became an advocate and helped drive Australian law reform; the federal Online Safety Act (2021) expressly covers doctored images.
- **The gap she faced:** finding copies (she did it by hand, once), proving which pages were hers, repeating takedowns, remembering what was sent.
- **What the toolkit adds:** repeatable discovery across Google Lens / Yandex / TinEye; **verification that an edited copy really derives from the original** (`near_duplicate` / `possible_deepfake` with face-region evidence if she verifies ownership); a **ledger of every URL and request**; takedown drafts; re-checks that detect re-uploads.
- **What it would not do:** it can't find pages no provider has indexed, and in 2013 there was still no law to cite. Today there is.

## Case 2: "Mrs X v. Union of India" (Delhi High Court, 2023): re-uploads and failed complaints
- **What happened:** after a former partner leaked her intimate images on pornographic sites, she complained to the police and on cybercrime.gov.in, and approached search engines and other services; her attempts did not remove the images, which kept being re-produced and re-uploaded. The Delhi High Court (guidelines, April 2023) held that intermediaries must remove the offending content itself, not just the URLs the victim lists, and noted that making victims keep searching for re-uploads is itself traumatic.
- **What the toolkit adds for such a person:** a **dated, tamper-evident record** of every complaint and response (this is what shows "I reported this on X date and nothing happened"); **deadline tracking**; evidence export for counsel; hash-based gate logic that shows platforms how identical re-uploads can be caught at upload.
- **What it would not do:** compel removal. The court ordered that; the toolkit prepares the file and keeps the clock.

## Case 3: The Madras High Court case → MeitY's NCII SOP (India, late 2025)
- **What happened:** a woman advocate's private images and videos were uploaded and re-uploaded across platforms. The Madras High Court directed action; MeitY then issued a standard operating procedure (late 2025) tightening **Rule 3(2)(b)**: intermediaries must restrict access to NCII within **24 hours** of a complaint by the person or their authorised representative; complaints can go through intermediaries directly, the **National Cybercrime Reporting Portal**, or One Stop Centres; the Indian Cybercrime Coordination Centre (I4C) maintains a hash repository.
- **What the toolkit adds:** the **IN takedown draft** (cites Rule 3(2)(b), asks for a ticket number, escalation to the Grievance Appellate Committee), a **24-hour deadline** stamped on each report and an `OVERDUE → ESCALATE` flag in `status`.

## Case 4: United States: TAKE IT DOWN Act (signed 19 May 2025)
- Covered platforms must provide a notice-and-removal process and **remove reported NCII (including AI-generated deepfakes) within 48 hours**, plus make reasonable efforts to remove **identical copies**; the FTC enforces from **19 May 2026** (civil penalties up to $53,088 per violation reported).
- **What the toolkit adds:** the **US takedown draft** (the elements a valid request typically needs), a 48-hour clock, and the evidence file for an FTC complaint if a platform ignores it.

## The composite demo persona ("Priya"): clearly fictional
`npm run demo` plays out a composite based on the patterns above using a **non-explicit stand-in photo**: protect (hash) → platform gate catches light edits but misses a crop/border/rotation → discovery verifies which pasted links truly contain the photo (and rejects an unrelated one) → IN takedown drafted, 24 h clock starts → a page is removed, re-check detects it → evidence exported → ledger tamper test fails as it should.

## Honest limits to say out loud in a demo
1. The toolkit's hash is **not** StopNCII's; real protection means creating the hash on stopncii.org.
2. StopNCII/hash-matching only helps on **participating platforms**, and cropped/filtered copies may need their own hash.
3. We can't see everything on adult sites; discovery covers what providers index, plus URLs the person supplies.
4. Drafts aren't legal advice.

## Sources
- StopNCII.org: How it works / FAQ (hash on device; PDQ/PhotoDNA for photos, MD5 for videos; video thumbnails not covered; participating platforms only).
- Noelle Martin: Canberra Times; Euronews (Apr 2023); Daze; New Idea.
- Mrs X v. Union of India: Columbia Global Freedom of Expression case summary; AMLegals summary of the Delhi HC guidelines (Apr 2023).
- MeitY NCII SOP and Rule 3(2)(b): SCC Online (12 Nov 2025); Phoenix Legal commentary; Lok Sabha answer on Rule 3(2)(b).
- TAKE IT DOWN Act: FTC stakeholder letter; WilmerHale (June 2026); Orrick (May 2025).
