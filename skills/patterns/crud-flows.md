# CRUD Flow Pattern Skill

## When to apply this skill

Apply this pattern when page observations include any of the following signals:

- Data tables or record lists with multiple rows
- A "New", "Add", "Create", or "+" button adjacent to a list
- Row-level action buttons: "Edit", "Update", pencil icon
- Row-level action buttons: "Delete", "Remove", trash icon
- A form that appears to modify an existing record
- Breadcrumbs showing a list → detail navigation pattern
- Detail pages with an "Edit" button

This skill stacks with app-specific skills. If an ecommerce.md or hrms.md skill
is also loaded, apply CRUD patterns within each relevant entity (products, employees, etc.).

## Flow patterns to identify

### List / View All
The user navigates to a page showing a collection of records.

- Entry: list page URL or a navigation link labelled with a plural noun (e.g. "Employees", "Products", "Orders")
- Steps: navigate to list → observe records → optionally search or filter
- Exit: same list page (with or without filter applied)
- Confidence anchor: a table or list with 2+ visible rows

### Create / Add New
The user creates a new record by completing a form.

- Entry: list page → "New", "Add", "Create", or "+" button
- Steps: click create button → fill required fields → submit
- Exit: success message, redirect to list page, or redirect to new record's detail page
- Confidence anchor: a clearly labelled create button + a form with Submit

### Read / View Detail
The user opens an existing record to read its full details without editing.

- Entry: list page → click a row or a "View" / "Details" link
- Steps: click record → observe detail page fields
- Exit: detail page
- Confidence anchor: a detail page URL pattern (e.g. `/records/123`) or a back-to-list link

### Update / Edit
The user modifies an existing record.

- Entry: list page or detail page → "Edit" button or pencil icon
- Steps: click edit → modify one or more fields → save/submit
- Exit: updated record detail page or list page with success confirmation
- Confidence anchor: an Edit button adjacent to a record AND a Save/Update button on the form

### Delete / Remove
The user removes an existing record, typically with a confirmation step.

- Entry: list page or detail page → "Delete" or trash icon
- Steps: click delete → confirm deletion (modal or inline confirm)
- Exit: record removed, returned to list page or success message
- Confidence anchor: a Delete/Remove button AND a confirm step (modal, alert, or "Are you sure?" text)

### Search / Filter
The user narrows the visible record set using search or filter controls.

- Entry: list page
- Steps: enter search term or select filter → observe filtered results
- Exit: same list page with filtered/reduced record set
- Confidence anchor: a search input or filter control on a list page

## Naming convention

Use the format: "<Entity Name> — <CRUD Action>"

Infer the entity name from page headings, breadcrumbs, or the list page title.

Examples:
- "Employee Record — Create"
- "Employee Record — Edit"
- "Employee Record — Delete"
- "Leave Request — View All"
- "Leave Request — Submit New"
- "Product — Search and Filter"
- "User Account — View Detail"

If the entity name is not determinable from observations, use "Record" as a fallback:
- "Record — Create"
- "Record — Edit"

## Confidence guidance

| Evidence | Score |
|---|---|
| Clear list page + create button + form with submit + success message | 0.90+ |
| List page + create button + form (no visible success state) | 0.80–0.89 |
| Edit button visible + form with save | 0.80–0.89 |
| Delete button + no confirm step visible in observations | 0.65–0.79 |
| Flow inferred from element labels alone with no URL change | 0.60–0.74 |

## Steps to always include for Create flows

1. Navigate to the list page
2. Click the "New" / "Add" / "Create" button
3. Fill in required form fields (list the visible required fields by label)
4. Submit the form
5. Observe the success state or redirect

## Steps to always include for Edit flows

1. Navigate to the list page
2. Locate the target record
3. Click the "Edit" button or pencil icon
4. Modify the target field(s)
5. Click Save / Update / Submit
6. Observe the success state or redirect

## Steps to always include for Delete flows

1. Navigate to the list page or record detail page
2. Click the "Delete" button or trash icon
3. Confirm the deletion (if a confirmation step is present)
4. Observe the record is removed from the list