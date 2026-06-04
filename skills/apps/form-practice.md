# Form and Widget Practice App Skill

## What this app is

A UI component demonstration application. It exists to showcase and practice
interactions with form elements, widgets, and browser behaviours. There are no
real business transactions — each section demonstrates an isolated interaction pattern.

## How to approach this app

Do NOT look for business flows. Look for interaction pattern flows.
Each section of the app is a self-contained demonstration with its own entry point.
Treat each top-level section as a separate flow category.

A sidebar or left navigation listing section names is the primary structural signal.
Each named section in the sidebar maps to one or more flows.

## Flows to prioritise

1. **Form completion flows** — text inputs, dropdowns, date pickers, checkboxes, radio buttons, file upload
2. **Widget interaction flows** — accordions, tabs, tooltips, modals, progress bars, sliders
3. **Table interaction flows** — sorting columns, filtering rows, pagination, row selection, inline editing
4. **Drag-and-drop flows** — reordering items, moving between containers
5. **Alert and dialog flows** — browser alerts, confirm dialogs, prompt dialogs, custom modals
6. **Frame and window flows** — iframes, new browser tabs or windows
7. **Dynamic content flows** — lazy loading, dynamic element visibility, waiting for elements

## High-signal UI elements

| Element | Flow anchor |
|---|---|
| Submit button adjacent to a form group | Form completion flow |
| "Click Me" or "Click Here" button | Modal, alert, or dynamic content flow |
| Accordion heading (expand/collapse) | Accordion interaction flow |
| Tab headers in a row | Tab switching flow |
| Drag handle icon | Drag-and-drop flow |
| Date picker input | Date selection flow |
| Table with column headers that are clickable | Table sort flow |
| Pagination controls (Next, Previous, page numbers) | Table pagination flow |
| File input element | File upload flow |
| Progress bar with percentage | Progress state flow |

## Actor inference

Default all actors to "User". DemoQA has no role-based access model.

## Naming convention

Name flows by what the interaction demonstrates, not by business intent.
Use the format: "<Component Type> — <Action>"

Examples:
- "Text Box — Complete and Submit"
- "Checkbox — Single and Group Selection"
- "Date Picker — Select a Date"
- "Modal Dialog — Open, Interact, and Close"
- "Data Table — Sort and Filter Rows"
- "Drag and Drop — Reorder List Items"
- "Browser Alert — Accept and Dismiss"

Do NOT name flows like "User Registration" or "Submit Application" —
these are demonstration components, not business processes.

## Confidence guidance

- Score 0.85+ if: the section has a clear form with a Submit button and a visible result/output area
- Score 0.70–0.84 if: the interaction is clear from element labels but there is no explicit success state
- Score below 0.70 if: the component behaviour is only inferrable from visual context not captured in element text

## POC notes — DemoQA (demoqa.com)

DemoQA sections:
- Elements (text box, checkbox, radio, upload, buttons, links, broken images)
- Forms (practice form, form submission)
- Alerts, Frame & Windows (alerts, frames, new tabs, modal dialogs)
- Widgets (accordions, autocomplete, date picker, slider, progress bar, tabs, tooltips, menu, select menu)
- Interactions (sortable, selectable, resizable, droppable, draggable)
- Book Store Application (login, register, profile, book list, book detail)

The Book Store section is the only one with business-like flows (login, register, browse).
Apply ecommerce-style flow naming there and interaction-style naming everywhere else.

The crawler may not reach all sections in 15 pages — prioritise Elements and Forms
sections as they have the highest density of interactable UI for POC validation.