-- Staff memos Stage 5: import the 14 past email memos (May 2023 – June 2026). 13 Nov 2026.
-- No schema change — uses the existing import columns on staff_memos (imported, import_kind, import_sent_to,
-- import_attachments). Each memo: status sent, sent at = the email date (12:00 Perth), sent / created by Blair (staff 10),
-- one section holding the email body (Markdown — shows like a memo written in the editor).
-- No recipients, seen rows, Wall posts, policy read requests or calendar events are created.
-- SAFE TO RUN TWICE: each memo is only inserted if no imported memo with the same title and sent time exists, and its
-- section is inserted in the same statement (so a second run inserts nothing at all).
-- Topic tags mapped onto the Stage 4 list (see the Stage 5 plan).

-- 1. 2023-05-13 — May Staff Memo
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'May Staff Memo', 'sent',
    array['Procedure change','Services','Rostering & leave','General / social'],
    10, '2023-05-13 12:00:00+08', '2023-05-13 12:00:00+08', '2023-05-13 12:00:00+08', 10, true, 'Memo', 'All staff (11)',
    array['3.P14B Leave Policy.pdf','Application for leave.pdf']
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'May Staff Memo' and sent_at = '2023-05-13 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$**Flu Vaccines**
- Flu vaccines are free for everyone through the month of May.
- Pharmacies can vaccinate adults and children from 5 years of age.
- When someone is booked in for a COVID vaccine ask if they would like a flu vaccine as well (and vice versa) — excellent work so far by everyone encouraging both vaccinations, keep up the good work :)
- Make sure you direct the patient to look through the checklist before they get a vaccination.

**Staff Roster**
- Paige is now responsible for staff rostering.
- Please contact her with your information on availability and leave requests.
- I have attached an editable "Application for Leave" form if you need to email her.
- All leave is to be applied for in accordance with the leave policy (attached) — see "Applying for Leave" in the Leave Policy.

**S8 Rx**
- Please make sure all S8s are filed in the S8 basket.
- No S8 scripts are to be put in the duplicate or claim baskets.

**Invoices**
- Please write "E" for entered on invoices when they have been entered in the computer.
- Entered invoices are filed in the second "Entered invoices" tray.
- API, Sigma and Blackmores invoices are delivered (entered) through the LOTS ordering system — do not enter manually.
- Delete emailed invoices once they have been printed out.

**Fax**
- The pharmacy fax number has been discontinued. We no longer have a fax, only email.

**MedsCheck**
- We need to focus on recording 20 MedsChecks per month — should be easily achievable, we completed 5 on Friday.
- It is something pharmacists and assistants can work on together.
- Need the patient to sign the consent form (can be referred to as a "Medicare claim form"); the pharmacy can make a claim for the service.
- Consent forms have been printed out and are in the dispensary.
- Reasons to do a MedsCheck: patients requiring a history/medication summary; new and current Webster pack patients; recent discharge from hospital; anyone who requires extra counselling on medication.

**60 Day Dispensing**
- 60-day dispensing was announced in the budget; no change from what was proposed previously.
- The business is predicted to lose at least $120,000 per year.
- This will mean we will be forced to make changes to how the pharmacy operates — staffing levels, opening hours, and prices of goods and services.
- I will keep you informed of any future changes.

Regards$body$, 10, 'Blair Chapman', 'Pharmacist'
from m;

-- 2. 2023-07-07 — Monthly Memo
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Monthly Memo', 'sent',
    array['Health promotion','Services','General / social'],
    10, '2023-07-07 12:00:00+08', '2023-07-07 12:00:00+08', '2023-07-07 12:00:00+08', 10, true, 'Memo', 'All staff (11)',
    array['Healthy Mums & Bubs_A4_Training notes_FA_3.pdf']
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Monthly Memo' and sent_at = '2023-07-07 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hello Pharmily

**Health Promotion — Healthy Mums & Bubs**
The current Health Solution is designed to promote the pharmacy as a destination for expert care for local mothers and infants in our community. The support materials strengthen pharmacist and staff knowledge on products and services for this group, while marketing materials promote awareness of the support we provide. From a services perspective, Whooping Cough vaccination and Leave Certificates are the primary focus.

Please ensure we all read the Staff Training Notes (attached) and the customer booklet that is in store. We have a lot of these booklets so please give them away to all parents with babies.

**LifeClub Promotion — Shop and Save**
- LifeClub members who spend $40 or more in one transaction on non-prescription items (card swiped by a pharmacy assistant at purchase) receive a $5 voucher. One voucher per purchase per day; redeemable on purchases $10 and over; valid until 31 August 2023.
- Promotion runs 4 July 2023 to 6 August 2023.

**Footy Tipping**
We are in the second half of the season and the current leader is Percy :) Congratulations Percy on your fine tipping — keep up the good work. Remember the staff member who finishes last will need to provide morning tea for everyone.

Regards$body$, 10, 'Blair Chapman', 'Pharmacist'
from m;

-- 3. 2023-08-08 — Monthly Memo
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Monthly Memo', 'sent',
    array['Procedure change','Services','Rostering & leave'],
    10, '2023-08-08 12:00:00+08', '2023-08-08 12:00:00+08', '2023-08-08 12:00:00+08', 10, true, 'Memo', 'All staff (10)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Monthly Memo' and sent_at = '2023-08-08 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hello Pharmily

**Change of Opening Hours**
- Our opening hours are changing from 1 September: we will close at 6:30 pm on weekdays; weekends remain unchanged.
- The change is a result of federal government cuts to pharmacy funding (60-day dispensing).
- Signs are in the pharmacy. Mention the change to any customers who come in after 6:30 pm during the month.
- The staff roster will need to change (and we are hiring new staff) — your standard hours may need to change. We require staff to be available to open at 8 am and to close at 6:30 pm. Please let Paige know what you are able to do.

**Webster Packs**
- The cost of Webster packs will change to $7/pack from 1 September (60-day dispensing cuts).
- Kelly is attaching a note to Webster packs for patients about the change.
- There is also a $7/pack charge for changing returned Webster packs.

**Wages**
- The wages spreadsheet will now be sent to Arthur (accountant) on Tuesday after all shifts have been completed. Payments will be processed Wednesday and should be in your account Wednesday.

**MedsChecks**
- Good work on achieving 20 MedsChecks per month over the last couple of months. Completing (and recording) 20 per month now needs to become standard practice.
- Pharmacy assistants: identify patients who would benefit — patients who don't understand or remember their medications, or who need a printout of repeats left. Don't use the term "MedsCheck" with patients; just say we'll give them a printout or the pharmacist will talk to them.
- All new Webster patients get a MedsCheck; reaching the safety net is a good opportunity too.

**UTI**
- UTI antibiotics are now available from the pharmacy without a prescription for eligible patients (e.g. non-pregnant females 18–65); a consultation with a pharmacist is required.
- Workflow and checklist still being developed. The consultation is entered in MedAdvisor (UTI service) and the medication labelled through the dispensing system.
- "UTI Service" through POS: two stock cards for the two antibiotics, priced $29.95 / $39.95.
- Pharmacy assistants can help by recording patient details as a "draft" UTI service in MedAdvisor.

Regards$body$, 10, 'Blair Chapman', 'Pharmacist'
from m;

-- 4. 2023-09-10 — Staff Memo
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Staff Memo', 'sent',
    array['Procedure change','Health promotion','Systems & IT'],
    10, '2023-09-10 12:00:00+08', '2023-09-10 12:00:00+08', '2023-09-10 12:00:00+08', 10, true, 'Memo', 'All staff (10)',
    array['202307_256_EC_LungHealth_TrainingNote_NoMarks (1).pdf']
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Staff Memo' and sent_at = '2023-09-10 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hello Pharmily

**Health Solution — Easy Clinic (Lung health)**
Our next Health Solution for 2023 supports patients with chronic respiratory conditions (almost 1 in 3 Australians). Live 12 September to 30 October, lining up with allergy season.
- Key focuses: preventing flare-ups of asthma/COPD (hayfever, respiratory infections, smoking & vaping cessation, breathing techniques); improving medication effectiveness (inhaler technique with MedsChecks); identifying high-risk patients (dispensary link: salbutamol).
- Tracking: 20 MedsChecks per month (focus on chronic respiratory patients); decreasing script-only salbutamol sales (chart in the office); increasing Dymista sales.
- Training notes attached and a copy is on the board in the dispensary.

**Invoices** — two filing trays:
- "Invoices – waiting": stock not yet received or not entered into the computer.
- "Entered invoices, statements": invoices entered into the computer (write "E" on them), plus statements and other documents not awaiting stock.

**Expensive medication ordering**
- Take care when ordering expensive items through wholesaler websites. Only pharmacists should add expensive prescription items to the cart. Refrigerated items cannot be returned if the wrong product is ordered.

**Returning items to API**
- Keep a signed copy of the SRA for returns: print it twice, attach one to the return, keep one; the driver signs our copy.

**Z Dispensing**
- We are changing dispensing/POS software to Z Dispensing on 3 October, with a training day on 4 October.
- A trial version is on the main computer to try out; a demonstration video was shared (POS register from 16:20; ordering/stock cards from 54:20): https://www.youtube.com/watch?v=-pvbUavXyHM

**COVID vaccines update (ATAGI)**
- All adults 75+ should receive an additional 2023 COVID-19 dose if 6 months since their last dose.
- Adults 65–74, and 18–64 with severe immunocompromise, should consider an additional dose after discussion with their healthcare provider.
- Adults recommended a dose in February 2023 who haven't had one should get one as soon as possible.

Regards$body$, 10, 'Blair Chapman', 'Pharmacist'
from m;

-- 5. 2024-02-25 — Monthly Memo
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Monthly Memo', 'sent',
    array['Procedure change','Services'],
    10, '2024-02-25 12:00:00+08', '2024-02-25 12:00:00+08', '2024-02-25 12:00:00+08', 10, true, 'Memo', 'All staff (11)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Monthly Memo' and sent_at = '2024-02-25 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hello Pharmily — Updates and reminders

**Webster Packs**
- Most Webster packs are now packed externally by DAAPA, with weekly deliveries on Wednesday or Thursday.
- Prescriptions will no longer be attached to packs. To charge, type the patient's name in the "Patient Prescription" section on the till — all prescription and OTC charges display; add the Webster pack charge as normal. See Kelly for details.

**Prescriptions on file**
- Get into the habit of deferring all new prescriptions not required when putting them on file — especially for MedAdvisor customers. Ensure patient profiles in Z Dispense are marked "Repeats Held".

**Website** — photos on our website are being updated; be prepared to get your photo taken :)

**Office printer** — do not turn it off at night (connection issues with the laptop); leave it in sleep mode.

**Melatonin**
- Spare melatonin 5 mg capsules are in the dispensary for when we have a prescription — no need to make the customer come back in a week. The product still needs to be ordered the same way to replace our stock.

**Road sign** — place it a metre back from the highway, viewable from both directions and not obstructed by plants.

**Vitamin D injections**
- Photocopy and keep any prescriptions for Vit D injections — prescriptions must be supplied when ordering. Photocopies go in Blair's tray; the original goes back in the duplicate basket.

**Loyalty program**
- Sign-up and scanning rates have dropped. Email address is the most important detail when signing up, then phone number; DOB and address are less important.

Regards$body$, 10, 'Blair Chapman', 'Pharmacist'
from m;

-- 6. 2024-05-13 — Monthly Memo
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Monthly Memo', 'sent',
    array['Procedure change','Systems & IT'],
    10, '2024-05-13 12:00:00+08', '2024-05-13 12:00:00+08', '2024-05-13 12:00:00+08', 10, true, 'Memo', 'All staff (12)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Monthly Memo' and sent_at = '2024-05-13 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hi Pharmily

**New EFTPOS machines**
- The new EFTPOS terminals are integrated with the POS. The settlement report only covers that day's transactions, so:
  - Close the tills later: 6 pm weekdays, 4:30 pm weekends.
  - Close down the left till and EFTPOS once the till has been counted.
  - After trading ends, print another settlement report on the right EFTPOS machine so an adjustment can be made for the next day; staple it to that machine's earlier settlement report and put it in the till for the next day's report.
  - No need to record AMEX separately.
- See Ashleigh or Suzie for more information.

**Melatonin 5 mg capsules**
- Each prescription needs to be ordered through NCC to replace our stock — the only way to re-order is to send the prescription to NCC. Customer phone numbers and emails are not required.

**MedAdvisor**
- The MedAdvisor (PlusOne) calendar is set up to track patients we need to phone and patient deliveries. Enter all patient call details there and note when the patient has been called. Suzie and Cathryn are in charge of checking the calendar every day to action the calls.

**Hire spreadsheet**
- If you're having difficulty using the hire spreadsheet, ask someone. Do not manually enter names/addresses in the print section — it fills automatically when the information is entered correctly.

Regards$body$, 10, 'Blair Chapman', 'Pharmacist'
from m;

-- 7. 2024-12-15 — Staff Memo
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Staff Memo', 'sent',
    array['Procedure change','Accreditation & training','Services'],
    10, '2024-12-15 12:00:00+08', '2024-12-15 12:00:00+08', '2024-12-15 12:00:00+08', 10, true, 'Memo', 'All staff (11)',
    array['QCPP-Training.pdf','Possible Face-to-face Evidence.docx']
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Staff Memo' and sent_at = '2024-12-15 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hello Pharmily

**QCPP**
- Our QCPP assessment is on 19/02/2024 [as written in the email — the assessment was in 2025]. Staff need to make sure their training records are up to date.
- Training requirements: 3 hours per year of S2/S3 training once the initial training unit has been completed; pharmacy students are exempt. A list of approved QCPP refresher courses is attached.
- Face-to-face assessment: a list of what to expect is attached — there may be questions for staff, checks on stock expiries and price scanning checks.

**Other points**
- Price NCC compounded prescriptions at $10 more than the quoted price on their website (to offset delivery charges).
- Vitamin D injections: prescriptions must be photocopied and kept; stock can only be ordered with a copy of the prescription.

Regards$body$, 10, 'Blair Chapman', 'Pharmacist'
from m;

-- 8. 2025-04-08 — Staff Newsletter — April 2025
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Staff Newsletter — April 2025', 'sent',
    array['Procedure change','Health promotion','General / social'],
    10, '2025-04-08 12:00:00+08', '2025-04-08 12:00:00+08', '2025-04-08 12:00:00+08', 10, true, 'Newsletter', 'Copy sent to Emereen (the all-staff send wasn''t found)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Staff Newsletter — April 2025' and sent_at = '2025-04-08 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hello Pharmily — welcome to the latest edition of our monthly newsletter: updates, celebrations and a few fun extras.

**Welcome Jasmine** — welcome to our new pharmacist Jasmine. Jasmine has been a pharmacist for 5 years and when she is not wearing the white coat she enjoys long walks on the beach and chasing after her son Eddy.

**Employee of the Month** — lots of competition! Special mention to Amanda and Melissa for excellent patient care to a customer after their vaccination. This month's winner is Suzie, recognised for her outstanding honesty in returning a lost $1,000 to a customer. Well done, Suzie!

**Housekeeping**
- Parking: roadworks are affecting parking — park as far away as you comfortably can and leave closer spots for customers.
- Compounded products: the price quoted for compounded items from National Customised Compounding is $10 more than their listed price.
- S8 prescriptions: file all S8 prescriptions carefully into the S8 basket.
- MedAdvisor: read and action any notes attached to MedAdvisor orders — some have been missed recently.
- Waiting prescriptions: keep all prescriptions and related notes in the baskets for medications waiting to be collected — the pharmacist handing out needs the original prescription for the final check.

**Message from the Operations Manager** (Paige) — nothing to report.

**Health Promotion — Vaccinations and Immunity**
- Flu vaccines are now available; the free flu vaccine program (for people not eligible under the NIP) runs in May and June: https://www.health.wa.gov.au/Articles/F_I/Influenza-immunisation-program/Free-influenza-vaccine-program-May-and-June-2025
- Immune product challenge until 27 May — mark the tracker each time you recommend and sell a focus product (ArmaForce, Chemist Own Immune Defence, Ethical Nutrients Immune Defence, Herbs of Gold Cold and Flu Strike); results adjusted for hours worked; prize to the winner. Let's also beat last year's flu vaccine total!

Thanks for reading — see you next month!$body$, 10, null, null
from m;

-- 9. 2025-06-12 — Staff Newsletter — June 2025
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Staff Newsletter — June 2025', 'sent',
    array['Procedure change','Health promotion','General / social'],
    10, '2025-06-12 12:00:00+08', '2025-06-12 12:00:00+08', '2025-06-12 12:00:00+08', 10, true, 'Newsletter', 'All staff (14)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Staff Newsletter — June 2025' and sent_at = '2025-06-12 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hello Pharmily — welcome to the latest edition of our monthly newsletter.

**Congratulations Cathryn** — for taking out the Immune Product Challenge and the $100 prize!

**Employee of the Month — Kelly** — for helping the pharmacy earn a five-star review, and for parking further away to leave closer spots for customers.

**Housekeeping**
- Mounjaro Pharma Program has ended — we no longer provide free pen tip needles with Mounjaro. Patients can buy needles in packs of 7; offer them when supplying Mounjaro.
- Waiting prescriptions: keep all prescriptions and notes in the baskets for medications awaiting collection, so the pharmacist can complete the final check.
- COVID vaccines: stock expected soon — when offering flu vaccinations, also offer COVID vaccinations.

**Message from the Operations Manager** (Paige) — nothing to report.

**Health Promotion — Vaccinations and Immunity**
- Continuing the flu season promotion: goal is to beat last year's total of flu vaccines and immune products and win a group staff prize* (*there may not be an actual prize).
- Free Flu Vaccine Program runs through May and June. Tracker for key immune products (ArmaForce, Chemist Own Immune Defence, Ethical Nutrients Immune Defence, Herbs of Gold Cold and Flu Strike).

Thanks for reading — see you next month!$body$, 10, null, null
from m;

-- 10. 2025-07-07 — Staff Newsletter — July 2025
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Staff Newsletter — July 2025', 'sent',
    array['Procedure change','Health promotion','General / social'],
    10, '2025-07-07 12:00:00+08', '2025-07-07 12:00:00+08', '2025-07-07 12:00:00+08', 10, true, 'Newsletter', 'All staff (13)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Staff Newsletter — July 2025' and sent_at = '2025-07-07 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hello Pharmily — welcome to the latest edition of our monthly newsletter.

**Congratulations Team** — we beat last year's total! Celebratory drinks at The Last Local, Saturday 2 August.

**Employee of the Month — Blair** — "our fearless leader has claimed the crown… while some might say it's rigged, we say it's well-deserved."

**Housekeeping**
- Monthly cleaning sections: the roster has been updated — please keep on top of your sections, cleaning and checking expiry dates.
- Wages spreadsheet: enter your hours by the Monday before wages are paid.
- Medela breast pump: hire information updated; a cheat sheet for hiring out the machine and a new patient information sheet for mums hiring the pump.
- This month's health promotion — Diabetes Support Campaign: diabetes risk awareness, early intervention and ongoing support; guide in the pharmacy.

**Message from the Retail Manager** (Ashleigh Devlin)
- Take payment before ordering any high-cost items; if unsure about the price, check with a senior team member.
- Non-fridge items can be returned to API; other suppliers are harder, so take extra care.
- Duplicate items on recent orders may mean a stock card error — check and correct stock cards. API allows returns within 5 days.

**Message from the Social Committee** (Katelyn & Paige)
- Staff Social Night, Saturday 2 August 2025: axe throwing at The Kart Center, 27 Baile Rd Canning Vale, ~6:30 pm ($35pp if 5+, $45pp under 5; enclosed shoes); dinner at The Last Local, 507 Nicholson Rd Canning Vale, 7:30 pm. RSVP to Katelyn by 18 July.

Thanks for reading — see you next month!$body$, 10, null, null
from m;

-- 11. 2025-11-28 — Staff Newsletter — December 2025 (email subject: "Staff Memo — Dec 2025")
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Staff Newsletter — December 2025', 'sent',
    array['Procedure change','General / social'],
    10, '2025-11-28 12:00:00+08', '2025-11-28 12:00:00+08', '2025-11-28 12:00:00+08', 10, true, 'Newsletter', 'All staff (12)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Staff Newsletter — December 2025' and sent_at = '2025-11-28 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hello Pharmily — welcome to the latest edition of our monthly newsletter.

**Congratulations Team** — the presentation of the shop is looking excellent: shelves neat, tidy and well-organised, stock looking great. Thank you for the care and attention you bring.

**Employee of the Month — Emereen** — absolutely amazing with every customer, handling every task to perfection and bringing a lovely spark of enthusiasm to the whole team — and she keeps us all smiling. ("Just between us, she might secretly think that marijuana is a kind of broccoli — but hey, we love her for it.") Thank you, Emereen — keep shining!

**Housekeeping**
- Congratulations Paige on the arrival of her and Blair's third child — Mum and bub doing well.
- Gingerbread Kids recipe from our Christmas elf Bridget (makes 10–20): 125 g butter (softened), ½ cup brown sugar, ½ cup golden syrup, 2½ cups plain flour (sifted), 2 tsp ground ginger, 1 tsp bi-carb soda. Icing: 1 egg white, 1 cup icing sugar, food colouring. Preheat oven to 190°C; cream butter and sugar; add syrup, flour, ginger and bi-carb to form a dough; chill 10 min; roll to 4 mm between non-stick paper; cut shapes; bake 8–10 min; cool. Whisk icing sugar and egg white, spread and decorate.
- Christmas shirts are on from 1 December — bring out your brightest, funniest or most festive tops.

**Message from the DAA Manager** (Kelly Myers)
- Ordering and packing ahead for the Christmas break — please give out the oldest packs in the cupboard first.
- Please don't give out the elastic bands — they are precious :)
- Thank you for ringing off packs with the client selected — it shows when packs were collected. Ask Kelly if you need help adding the client.
- Thanks for deferring scripts — double-check there are no owings for that medication.

**Message from the Social Committee** (Katelyn & Paige)
- Christmas party: The Como Hotel, 7 pm, Saturday 20 December 2025 — drinks, food, games by Suzie, and Bad Santa (any present, naughty or nice).

Thanks for reading — see you next month!$body$, 10, null, null
from m;

-- 12. 2026-02-15 — Update from Retail Excellence Conference
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Update from Retail Excellence Conference', 'sent',
    array['Accreditation & training','Services'],
    10, '2026-02-15 12:00:00+08', '2026-02-15 12:00:00+08', '2026-02-15 12:00:00+08', 10, true, 'Memo', 'All staff (12)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Update from Retail Excellence Conference' and sent_at = '2026-02-15 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, 'Little things that make a big difference', $body$I attended the Retail Excellence Conference in Melbourne, and it reinforced how important the small things we do each day are. Practical ideas to start using straight away:

- **Loyalty rewards — every interaction counts.** Always offer to scan or register customers ("Can I scan your rewards card for you?"). For script customers, enter their name into the till for rewards. Collecting email and mobile numbers is essential. Loyalty members visit on average 26 more times than non-members.
- **Scripts & retention.** Where possible keep scripts on file; encourage customers to leave repeats with us, even with eScripts.
- **Problem solving & price matching.** If a customer asks for a price match, ask the manager and do our best to help. Solving problems builds trust; trust builds loyalty.
- **First & last impressions.** The first 10 seconds set the tone; the final 10 seconds are what customers remember.
- **Ongoing training.** On quieter days, complete online training — even one short session at a time.

Excellence happens when a store stops being a shop and starts being part of the community 💙$body$, 1, 'Ashleigh Devlin', 'Retail Manager'
from m;

-- 13. 2026-05-17 — Pharmacist Availability
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Pharmacist Availability', 'sent',
    array['Rostering & leave'],
    10, '2026-05-17 12:00:00+08', '2026-05-17 12:00:00+08', '2026-05-17 12:00:00+08', 10, true, 'Notice', 'Paige, Amanda, Jasmine (3)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Pharmacist Availability' and sent_at = '2026-05-17 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$To help with holiday and leave planning, current pharmacist unavailability:
- 1–7 July 2026 — Amanda — Holiday
- 19–22 July 2026 — Amanda — Conference
- 5–7 August 2026 — Blair — Conference
- 24–28 August 2026 — Blair — Study
- 21–25 September 2026 — Blair — Study
- 10–18 October 2026 — Blair — Holiday

Please keep these dates in mind when planning leave requests, as pharmacist cover may be limited.$body$, 10, 'Blair Chapman', 'Pharmacist'
from m;

-- 14. 2026-06-14 — Chalkboard Pocket
with m as (
  insert into public.staff_memos (pharmacy_id, title, status, topics, created_by_staff_id, created_at, updated_at, sent_at, sent_by_staff_id, imported, import_kind, import_sent_to, import_attachments)
  select '81ab394f-d642-4246-b896-e71938b25671', 'Chalkboard Pocket', 'sent',
    array['Systems & IT'],
    10, '2026-06-14 12:00:00+08', '2026-06-14 12:00:00+08', '2026-06-14 12:00:00+08', 10, true, 'Notice', 'All staff (10)',
    '{}'::text[]
  where not exists (select 1 from public.staff_memos where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and imported and title = 'Chalkboard Pocket' and sent_at = '2026-06-14 12:00:00+08')
  returning id
)
insert into public.staff_memo_sections (pharmacy_id, memo_id, sort_order, heading, body, author_staff_id, signature_name, signature_role)
select '81ab394f-d642-4246-b896-e71938b25671', m.id, 0, '', $body$Hi Pharmily — you can now get Chalkboard on your phone: Chalkboard Pocket, the pocket version of the app we use at work.

1. **Open it:** on your phone, open chalkboard.au/me?p=byford
2. **Log in** with your work email (the address this was sent to) and choose a password — the first time, just pick one and it sets up your account.
3. **Add it to your home screen:** iPhone (Safari) — Share → "Add to Home Screen" → Add. Android (Chrome) — ⋮ → "Add to Home screen"/"Install app" → Add.

What you can do: Roster (your shifts and the full roster), Time off (leave and availability), Wages (check and confirm your hours), Messages (message anyone on the team).

Any trouble logging in, let me know. — Blair$body$, 10, null, null
from m;

-- Check — expect: 14 imported memos, oldest 13/05/2023, newest 14/06/2026, 14 sections, 0 recipients / seen / Wall posts
select count(*) as imported_memos,
       to_char(min(sent_at at time zone 'Australia/Perth'), 'DD/MM/YYYY') as oldest,
       to_char(max(sent_at at time zone 'Australia/Perth'), 'DD/MM/YYYY') as newest,
       (select count(*) from public.staff_memo_sections s join public.staff_memos x on x.id = s.memo_id where x.imported) as sections,
       (select count(*) from public.staff_memo_recipients r join public.staff_memos x on x.id = r.memo_id where x.imported) as recipients,
       (select count(*) from public.kiosk_notes n join public.staff_memos x on x.id = n.memo_id where x.imported) as wall_posts
from public.staff_memos where imported and pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
