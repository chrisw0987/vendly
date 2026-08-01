# Vendly Matching Engine
Version: 1.0
Last Updated: July 2026

---

# Purpose

The Vendly Matching Engine connects buyer wishlist items to vendor inventory
that is available at upcoming card shows.

Its goals are:

- Help buyers quickly find cards they want.
- Prioritize nearby and saved shows.
- Provide accurate, transparent matching.
- Serve as the foundation for notifications,
  recommendations, analytics, and future AI features.

---

# Match Pipeline

Every inventory item must pass every stage below.

Wishlist Item
        │
        ▼
Card Match
        │
        ▼
Type Match
        │
        ▼
Condition / Grade Match
        │
        ▼
Inventory Validation
        │
        ▼
Show Validation
        │
        ▼
Vendor Validation
        │
        ▼
Ranking
        │
        ▼
Returned to Frontend

---

# Stage 1 — Card Match

Required:

- card_id must match exactly.

Never match by:

- Card Name
- Set Name
- Card Number

Reason:

card_id uniquely identifies a Pokémon card.

---

# Stage 2 — Card Type

Two types exist:

Raw

Graded

Rules:

Raw only matches Raw.

Graded only matches Graded.

No cross matching.

---

# Stage 3 — Raw Card Matching

Desired Condition:

ANY

matches

NM
LP
MP
HP
DMG

Otherwise:

NM matches NM

LP matches LP

MP matches MP

HP matches HP

DMG matches DMG

No fuzzy matching.

---

# Stage 4 — Graded Card Matching

Grade Company

Must match exactly.

Examples:

PSA 10 → PSA 10

CGC 10 → CGC 10

PSA never matches CGC.

Grade

Must match exactly.

Examples:

PSA 10 ≠ PSA 9

PSA 9 ≠ PSA 8

No range matching.

---

# Stage 5 — Inventory Validation

Inventory must be:

✓ Public

✓ Quantity > 0

✓ Not Sold

Listing price may be NULL.

NULL prices still match.

---

# Stage 6 — Show Validation

Inventory must be assigned to a show.

Show must not have ended.

Uses:

end_date

or

starts_at

if end_date is NULL.

---

# Stage 7 — Vendor Validation

Vendor profile must be public.

Vendor must have:

Display Name

Booth Number

Public Enabled

---

# Price Status

Calculated from:

Target Price

vs

Listing Price

Possible values:

Below Target

At Target

Above Target

Price Not Listed

No Target Price

Price never filters matches.

It only provides information.

---

# Match Ranking

Current priority:

1. Saved Shows

2. Lowest Listing Price

3. Earliest Event

4. Vendor Name

Only the best-ranked match is displayed on the Wishlist card.

The full list appears after opening Match Details.

---

# Returned Summary

Every Wishlist card receives:

Match Count

Lowest Price

Saved Show Count

Best Event

Best Vendor

Best Booth

Price Status

---

# Future Roadmap

Planned (not implemented):

⭐ Vendor Rating

⭐ Distance From User

⭐ Verified Vendor Priority

⭐ Favorite Vendors

⭐ Inventory Updated Recently

⭐ AI Recommended Match

⭐ Trade Availability

⭐ Booth Crowdedness

⭐ Show Popularity

⭐ Multiple Copies Needed

⭐ Notification Priority

---

# Related SQL Functions

Current Production

get_user_wishlist_summary()

Returns:

One summary row per wishlist item.

Current Production

get_wishlist_item_matches(uuid)

Returns:

Detailed vendor matches for one wishlist item.

---

# Design Philosophy

The matching engine lives entirely in the database.

React never decides who matches.

The frontend only requests results and displays them.

This guarantees:

✔ Consistent results

✔ Easier maintenance

✔ Better performance

✔ Reusable logic

✔ One source of truth