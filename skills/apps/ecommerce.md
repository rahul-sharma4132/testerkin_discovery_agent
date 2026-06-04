# Ecommerce App Skill

## What this app is

An ecommerce web application. Users browse products, manage a cart, and complete purchases.
There is typically a login/registration flow gating the purchase experience.

## Flows to prioritise

Look for these flows first — they are the highest value in any ecommerce app:

1. **Authentication** — login, logout, registration, password reset
2. **Product discovery** — browsing a catalogue, filtering by category or price, searching
3. **Product detail** — viewing a single product, reading description, selecting variants
4. **Cart management** — add to cart, update quantity, remove item, view cart
5. **Checkout** — entering shipping details, payment, placing an order
6. **Order confirmation** — success state, order number, summary

## High-signal UI elements

The following elements are strong anchors for specific flows:

| Element | Flow anchor |
|---|---|
| "Add to Cart", "Buy Now" button | Cart management or checkout |
| Cart icon, bag icon, basket icon | Cart page entry |
| "Login", "Sign In", "Log In" button | Authentication entry |
| "Register", "Create Account" button | Registration entry |
| "Checkout", "Proceed to Checkout" button | Checkout entry |
| "Place Order", "Confirm Order" button | Checkout exit |
| Price display + quantity selector together | Product detail |
| Filter sidebar or sort dropdown | Product discovery |
| Search input | Search flow entry |
| Order number display | Confirmation exit |

## Actor inference

- If the app has guest checkout and registered users, name actors: "Guest User" and "Registered Customer"
- If only one type of user is visible, default actor to "User"
- If an admin panel is visible (order management, inventory), add actor "Admin"

## Confidence guidance

- Score 0.85+ if: clear entry URL (e.g. `/login`, `/cart`, `/checkout`) AND clear exit URL or success message visible
- Score 0.65–0.84 if: steps are inferred from button labels alone with no URL change evidence
- Score below 0.65 if: flow is partially visible or requires state not present in the crawl observations

## Naming convention

Use action-noun format:
- "User Login"
- "Product Search and Filter"
- "Add Product to Cart"
- "Guest Checkout"
- "Order Placement"

## POC notes — SauceDemo (www.saucedemo.com)

SauceDemo is a minimal ecommerce demo with:
- Login page (multiple test user accounts)
- Product listing page with sort controls
- Product detail pages
- Cart page
- Checkout form (two steps: info → summary → complete)
- Order complete confirmation page

Expected flows: User Login, Browse Product Catalogue, View Product Detail,
Add Product to Cart, Checkout — Step 1 (Info), Checkout — Step 2 (Summary),
Place Order, User Logout

The confidence on all flows should be 0.80+ as URLs change clearly between steps.