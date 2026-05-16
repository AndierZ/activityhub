**ActivityHub**

Product & Development Strategy

Version 1.0  ·  May 2026

# **1\. The Problem**

Parents and students managing multiple after-school activities — piano lessons, swimming, tutoring, sports — currently rely on a fragmented mix of WhatsApp messages, paper diaries, cash payments, and spreadsheets. As the number of activities grows, this manual coordination becomes overwhelming for everyone involved.

Key pain points today:

* No single view of all scheduled activities across providers

* Booking and rescheduling requires direct back-and-forth communication

* Payment tracking is inconsistent — easy to lose track of what's been paid or owed

* No reminders or conflict detection across different activity types

* Teachers face the same chaos in reverse — managing multiple students manually

# **2\. Product Vision**

ActivityHub is an all-in-one activity management platform that starts as a personal organizer for parents and students, and evolves into a two-sided marketplace connecting families with activity providers.

| 🎯 North Star  Every family should have a single, clear view of each child’s activities, schedules, and payments — all in one place, without chasing anyone on WhatsApp. |
| :---- |

## **The Waze Analogy**

Much like Waze doesn't require roads to officially report their own congestion, ActivityHub V1 doesn't require teachers to participate. Parents report what they know — their lessons, schedules, payments — and the app aggregates it into a crowdsourced picture of each teacher's world. Value compounds as more families join.

# **3\. Go-To-Market Strategy**

## **Phase Sequence: Demand Before Supply**

Most marketplace startups fail by trying to build both sides simultaneously. ActivityHub deliberately builds demand first — a pool of engaged parents and students — and uses that as the lever to bring teachers onto the platform.

| Phase | Name | Users | Key Features | Revenue |
| :---- | :---- | :---- | :---- | :---- |
| V1 | Personal Organizer | Parents & Students | Calendar, booking log, payment tracker, crowdsourced availability | Free |
| V2 | Hybrid Platform | Parents, Students & Teachers | Teacher profile claiming, live availability, booking confirmation | Freemium |
| V3 | Marketplace | All users \+ Discovery | Provider listings, reviews, in-app payments, premium profiles | SaaS \+ Transaction fees |

## **The Network Effect Flywheel**

* Parents log their lessons → crowdsourced teacher profiles become richer

* Richer profiles attract more parents → more accurate schedules

* Critical mass of parents → compelling pitch to bring teachers on

* Teachers join → authoritative data replaces crowdsourced estimates

* Better data → more parent retention and referrals

# **4\. V1 Scope — The Personal Organizer**

## **Core Philosophy**

V1 is a parent/student-only experience. No teacher onboarding, no two-sided communication, no live booking confirmation. Parents self-report everything they know. The app is their personal ledger, not a shared system of record.

| 💡 Key Insight  If parents are already doing this work manually, having them do the same work inside a structured app is a very low adoption barrier — and immediately more useful. |
| :---- |

## **Core Features**

**Calendar View**

* Unified calendar showing all activities across all providers

* Color-coded by activity type or provider

* Week and month views

* Conflict detection across activities

**Activity & Teacher Management**

* Add activities: name, teacher, location, cost per session

* Capture teacher email or phone (optional but nudged) — the key to future linking

* Support for recurring slots (e.g. every Tuesday 4pm) and one-off sessions

* One-tap shortcut to contact teacher via WhatsApp/SMS for anything requiring direct communication

**Booking Management**

* Log scheduled, cancelled, and rescheduled sessions

* Self-reported status: confirmed by parent, pending, cancelled

* Reschedule flow updates the personal calendar

**Payment Tracker**

* Log payments per session or in bulk

* Track paid / pending / overdue status

* Simple ledger view per activity and per teacher

* No payment processing in V1 — tracking only

**Crowdsourced Teacher Availability**

* When multiple parents report lessons with the same teacher (matched by email/phone), the app surfaces a community view of that teacher's schedule

* Conflict warnings: 'Another student has reported a lesson at this time — this slot may be taken'

* Confidence levels: Reported (parent-logged) vs. Confirmed (teacher-verified, V2+)

**Reminders & Notifications**

* Session reminders (configurable: 1hr, 24hr before)

* Payment due reminders

* Push notifications and/or email

**Per-Child Profiles**

For school-age children who don’t yet have their own phones, managing their schedule inside a parent’s calendar is genuinely painful. ActivityHub acts as a dedicated side calendar for each child, separate from the parent’s personal life but accessible on the same device. This is especially powerful for families managing multiple children across multiple activities.

* Each child gets a named profile with a unique color (e.g. Maya in blue, Liam in green)

* Parent can toggle between individual child views or a merged “everyone” view

* Sibling schedule conflicts are surfaced automatically (e.g. both kids booked at 4pm Tuesday)

* Payment tracker is per-child, with a family-wide summary view

* When the child eventually gets their own phone (V2+), their profile and full activity history transfers seamlessly to their own account

# **5\. Data Architecture — Designed for V2**

## **The Core Principle**

V1's UI is simple, but the data model is designed for two-sided use from day one. This ensures a clean, non-disruptive transition to V2 without requiring users to re-enter data.

## **Teacher Profile — The Key Design Decision**

When a parent adds 'Piano with Ms. Chen,' the app creates a teacher profile record in the background — name, subject, rate, location — even though Ms. Chen has no account yet. The anchor is her email or phone number.

When Ms. Chen eventually joins in V2, she claims that profile. Instantly, all parents who listed her are connected. Her schedule, all bookings, and payment history are already there — built by her students.

| 🔗 Venmo Analogy  Just like Venmo lets you send money to someone not yet on the platform (they claim it when they join), parents can log lessons with a teacher who hasn't joined yet. The data waits for them. |
| :---- |

## **Minimum Viable Teacher Profile (V1)**

* Teacher name

* Email or phone number (the matching key)

* Subject / activity type

* Hourly or per-session rate

* Location or online/in-person flag

## **V1 → V2 Transition Experience**

**For the Parent**

The experience barely changes. One day they receive a notification: 'Ms. Chen has joined ActivityHub — her live availability is now connected to your account.' From that point, bookings are real-time confirmed rather than self-reported. It's an upgrade, not a disruption.

**For the Teacher**

Onboarding is unusually warm. Instead of signing up to an empty app, they immediately see: '3 families are already tracking lessons with you — here's your schedule as they've recorded it.' They correct anything inaccurate and take over from there. Much better than a cold start.

# **6\. V1 Known Limitations (By Design)**

These are deliberate trade-offs, not oversights. They define exactly what V2 needs to solve:

* Authoritative availability — crowdsourced slots are estimates. If Ms. Chen takes a week off, the app won't know unless a parent logs it.

* Teacher-initiated changes — no broadcast mechanism without teacher on the platform. Parents still hear about mass cancellations via WhatsApp.

* Payment reconciliation — if a parent logs 'paid $50' and the teacher has no record, the app cannot arbitrate.

* Real booking confirmation — sessions are self-reported; there is no live confirmation loop with the teacher in V1.

| ⚠️ Important  These limitations are edge cases around communication, not around core value. They're the exact pain points that will pull teachers onto the platform naturally when they see their students using it. |
| :---- |

# **7\. Revenue Model**

## **V1 — Free**

No monetization in V1. The goal is adoption and data. Every parent who joins and logs their activities enriches the teacher profiles that become the foundation of the marketplace.

## **V2 — Freemium**

* Free tier: teachers can claim their profile, view their crowdsourced schedule, basic booking management

* Paid tier: live availability calendar, booking confirmations, payment management, priority listing

## **V3 — Marketplace (ZocDoc / Angie's List Model)**

* Teacher subscription for premium profile and discovery features

* Transaction fee on in-app payment processing

* Promoted listings for new teachers entering a market

* Enterprise/school district plans

| 💰 Key Insight  The free crowdsourced V1 experience is the lead generation engine for the paid teacher tier. Teachers don't need to be cold-sold — their students are already using the app. |
| :---- |

# **8\. V1 Core Screens**

The four screens to design and build first:

* Child Profiles — add each child, assign a color, toggle between individual and merged family view

* Home / Calendar View — unified weekly/monthly view per child or across all children

* Add / Edit Booking — activity type, child, teacher, time, recurrence, cost

* Payment Tracker — ledger view, log a payment, outstanding balance

# **9\. Design Principles**

* Self-reported first — the app trusts what the parent logs; no verification required in V1

* Progressive disclosure — simple entry, rich detail available when needed

* Transparent confidence — always clear whether data is parent-reported or teacher-confirmed

* Non-disruptive upgrade — V2 teacher features enhance the experience, never gate it

* WhatsApp-friendly — for anything requiring real communication, one tap hands off to existing channels

ActivityHub · Confidential · May 2026