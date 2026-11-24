# Grupo Real Tools

Custom configurations, tweaks, and tools for Frappe and ERPNext.

## Scope

The app supports configuration for multiple Frappe sites. The strategy documented here covers settings shared across
sites and settings specific to individual sites.

## Features

- Shared and site-specific settings in custom JSON.
- Conditional application of configuration during migration through the documented `after_migrate` flow.
- ERPNext Point of Sale customizations for the product catalog, customer details, cart, and order printing.

## Requirements

As declared in [pyproject.toml](pyproject.toml):

- Python 3.14 or later.
- Frappe `>=16.60.0,<17.0.0`.
- ERPNext `>=16.60.0,<17.0.0`.

## Configuration

### Why we chose custom JSON

Standard fixtures are a common way to replicate configurations and data across sites. The design rationale for this
app was that fixtures can overwrite site-specific settings and make small variations harder to maintain without
multiple versions of the same fixture.

Applying each customization through a separate hook was also considered. That approach would require more hook code
as settings grew, making it harder to manage configuration across environments.

### Documented migration flow

1. Prepare custom JSON with settings shared across sites and settings specific to individual sites.
2. Register an `after_migrate` method in [hooks.py](gr_tools/hooks.py) to read the JSON after migration.
3. The method identifies the current site, selects its configuration, and applies it through Frappe's API.

The design aims to centralize configuration, preserve site-specific settings, and reduce manual work after migration.

## Point of Sale

The [page script](gr_tools/public/js/page/point_of_sale.js) extends ERPNext's Point of Sale page and loads its
[stylesheet](gr_tools/public/css/point_of_sale.css). These changes do not alter the standard invoice form.

### Catalog and Cart

- The product search is wider, and names wrap on product cards instead of being limited to two lines.
- Cart rows show the full item name without showing or truncating the invoice line's description.
- Each editable cart row has a quick remove button. It removes that row from the current cart without saving
  the invoice, and it is hidden during payment. The item and shipping charge remove buttons use the same color treatment.
- The cart camera and **Save as Draft** are unavailable on an empty cart. Saving a draft uses the current invoice
  form without submitting it or opening the payment screen.

### Customer and Addresses

- **Edit Customer** opens the customer details, and **Select a Customer** changes the customer on the sale.
  The loyalty fields are hidden when the invoice metadata hides the loyalty redemption section.
- The customer details show saved addresses using Frappe's address format. The primary badge uses the customer's
  primary-address link; the preferred shipping badge uses the address's own flag. Other address types are
  shown except **Billing** and **Shipping**.
- **New Address** is available when the user can create addresses. It opens Frappe's quick-entry form, links the
  new address to the customer, and refreshes the list without changing the delivery address on the sale.
- In **Additional Information**, the shipping address preview updates when the selected address changes, provided
  both `shipping_address_name` (an Address link) and `shipping_address` are configured in POS Settings.

### Order Printing

The order summary's extra print button opens a selector populated by Frappe for the invoice type, excluding
**Standard**. It opens the chosen format in print preview without a letterhead. If the invoice has neither
a customer address nor a shipping address, the button explains that instead of opening the selector.

## Technical documentation

- [Frappe hook registration](gr_tools/hooks.py)
- [Configuration synchronization](gr_tools/grupo_real_tools/sync.py)

## Contributing

Read [AGENTS.md](AGENTS.md) for repository instructions and verification requirements.

## License

AGPL 3.0, as declared in [hooks.py](gr_tools/hooks.py).
