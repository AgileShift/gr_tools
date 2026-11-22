import frappe
from grupo_real_tools.ecommerce.api.item import _get_item_price


def _build_base_query():
	""" Check ecommerce.item.py for the base query."""
	return """
		SELECT
			item.item_name,
			item.image,
			item.item_group,
			bin.item_code,
			(bin.actual_qty - bin.reserved_stock) as actual_qty
		FROM `tabBin` AS bin
		INNER JOIN `tabItem` AS item ON item.item_code = bin.item_code
	"""  # TODO: ADD Warehouse


@frappe.whitelist(allow_guest=False)
def get_products(company: str, warehouse: str, pricing_rule: str = ''):
	""" Get a list of available products with optional price list filtering. """

	if pricing_rule:
		query = _build_base_query() + "WHERE bin.warehouse = %(warehouse)s AND bin.item_code IN %(items)s"

		items = frappe.get_all("Pricing Rule Item Code", filters={"parent": pricing_rule}, fields=["item_code"], pluck='item_code')

		items = frappe.db.sql(query, {'items': tuple(items), 'warehouse': warehouse}, as_dict=True)

		for item in items:
			item.price = _get_item_price(item.item_code)

	return items
