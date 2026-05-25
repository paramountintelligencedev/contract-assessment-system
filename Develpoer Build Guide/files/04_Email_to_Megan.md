Subject: Re: Waters Contract PoC — Paramount's Approach + What to Expect

Hi Megan,

Thank you for the detailed brief — this is exactly the clarity we needed to move fast and build the right thing.

We're confirmed and ready to go. Here is exactly what you should expect from us.

---

WHAT WE ARE BUILDING

A working web-based prototype with two workflows, both built on Claude and ready to demo with realistic synthetic contracts by Tuesday EOD.

Workflow 1 — Vendor Proposal Validator
A user uploads a vendor contract, SOW, or proposal — including large documents like the Deloitte 150-pager Seth mentioned. Claude reads the full document, extracts all key terms and obligations, compares them against a Waters enterprise requirements checklist, and produces a colour-coded risk report: Green (compliant), Amber (needs negotiation), Red (missing or non-compliant). It also produces a plain English summary and a list of recommended follow-up questions for the vendor.

Workflow 2 — Contract Comparison
A user uploads two vendor contracts for the same type of engagement. Claude compares them clause by clause — termination rights, liability caps, IP ownership, payment terms, security obligations, and more — identifies which vendor's terms are stronger for Waters, and produces a negotiation recommendation with the top priorities to address.

Both workflows keep a human in the loop. Nothing leaves the system without user review. Everything is logged locally.

---

INPUTS WE NEED FROM WATERS (OR WE GENERATE SYNTHETICALLY)

For the prototype demo, we will generate realistic synthetic contracts so no real Waters data is required. We will create:
- One 8-10 page IT professional services SOW (representing the Deloitte-type document Seth described), with intentionally weak clauses to demonstrate the validator catching real issues
- Two MSAs from different vendors with differing terms on liability, termination, and IP — to demonstrate the comparison workflow
- A Waters enterprise requirements checklist (15-20 criteria) based on standard life sciences enterprise requirements

If Waters wants to provide real contract samples for the demo, we can incorporate them — but we do not require this to deliver by Tuesday.

---

WHAT YOU WILL SEE IN THE DEMO

The demo will run end to end in under 3 minutes per workflow:
1. Upload a contract (or two) via the browser
2. Claude processes it in real time
3. A risk report or comparison table appears on screen with colour-coded clause status
4. A plain English summary is shown
5. Follow-up questions or negotiation priorities are listed
6. Results are downloadable as JSON

---

ARIBA

Confirmed — no Ariba integration for this prototype. We have designed the architecture so Ariba can be connected via API in a future sprint. We have previously built an Ariba integration at enterprise scale (15,000 annual contracts at Jazz/VEON) and can speak to that experience on the Waters call.

---

PRIOR WORK

To directly answer your question: yes, we have built this type of system before at enterprise scale. At Jazz (a subsidiary of VEON — the largest telco in South East Asia, 80 million users), we built a contract risk assessment and contract query system that processed 15,000 annual contracts. The system was built on AWS using Bedrock, Kendra, and encrypted S3 buckets. It included Ariba API integration, user-level security, and a multi-tenant architecture. We can share details of this on the Waters call.

---

SOLUTIONS ARCHITECT

I (Ali) will join the Waters call as solutions architect. I can speak to architecture, Claude implementation, document ingestion, security, and production deployment — specifically the questions Scott (security) and Hari (guild lead) raised on the May 22nd call that remained unanswered.

---

TIMELINE

Day 1 (today/tomorrow): Prototype built and running locally — both workflows functional with synthetic contracts
Day 2: Deployed to AWS with encrypted storage — live URL ready to share
Tuesday EOD: Prototype link delivered to you

Please let us know:
1. Whether you want us to join the Waters call directly or provide the prototype for Catalant to demo
2. If Waters has any real contract samples they would like run through the system ahead of the call
3. Confirmation on the time of the Monday alignment call

Looking forward to moving fast on this.

Best,
Ali
Paramount Intelligence
