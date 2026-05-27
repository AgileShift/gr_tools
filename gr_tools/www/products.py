import frappe
from erpnext.utilities.product import get_price
from frappe.desk.treeview import get_all_nodes


def _comma_separated_to_list(value: str | None) -> list[str]:
	# FIXME UTIL: validate usage
	if not value:
		return []

	return [item.strip() for item in value.split(",") if item.strip()]


def _get_ecommerce_settings():
	# TODO: Show BackOrder Products?(For future sales or pre-orders)
	return {
		'company': frappe.get_cached_value('Global Defaults', 'Global Defaults', 'default_company'),
		'price_list': frappe.get_cached_value('Selling Settings', 'Selling Settings', 'selling_price_list'),
		'warehouse': frappe.get_cached_value('Stock Settings', 'Stock Settings', 'default_warehouse')
	}


def _build_base_query():
	"""
	Query for Available Items. FIXME: projected_qty = actual_qty - reserved_qty | Test: Planned | Requested | Ordered
	# actual_qty = All Items at Warehouse
	# reserved_qty = Sum of Items in Sales Orders(Not Draft) and Stock Reservation
	# projected_qty = actual_qty - reserved_qty
	# reserved_stock = Sum of Items in Stock Reservation | # FIXME: Dont Show POS Reserved Stock! is like a Virtual Field

	# TODO: Query the Warehouse where its available + quantity -> Get all warehouse available(marked) for ecommerce sales
	"""
	return """
		SELECT
			item.item_name,
			item.image,
			item.item_group,
			bin.item_code,
			(bin.actual_qty - bin.reserved_stock) as actual_qty
		FROM `tabBin` AS bin
		JOIN `tabItem` AS item ON item.item_code = bin.item_code
		WHERE (bin.actual_qty - bin.reserved_stock) > 0 AND bin.warehouse = %(warehouse)s
	"""


def _get_descendant_categories(categories: list[str]) -> list[str]:
	if not categories:
		return []

	descendant_groups = frappe.db.sql("""
		WITH RECURSIVE category_tree AS (
			SELECT name FROM `tabItem Group` WHERE name IN %(categories)s
			UNION ALL
			SELECT child.name FROM `tabItem Group` child
			INNER JOIN category_tree ON child.parent_item_group = category_tree.name
		)
		SELECT DISTINCT name FROM category_tree;
		""", {"categories": categories}, pluck='name')
	return descendant_groups


def _calculated_discounted_rate_and_percent(item):
	# When 'Formatted Discount Rate' is Set, other fields are empty so auto-calculated here!
	item.price.mrp = float(item.price.formatted_mrp.replace('$', '').strip())
	item.price.discount_rate = float(item.price.formatted_discount_rate.replace('$', '').strip())
	item.price.discount_percent = round((item.price.discount_rate / item.price.mrp) * 100, 2)

	return item


@frappe.whitelist(allow_guest=True)
def get_product(item_code: str):
	"""
	Get a single product by item_code.

	Parameters:
		item_code (str): Fetches only the specific product.

	Returns:
		Single product.
	"""
	settings = _get_ecommerce_settings()
	query = _build_base_query() + " AND item.item_code = %(item_code)s LIMIT 1"

	if not (item := frappe.db.sql(query, {'item_code': item_code, 'warehouse': settings['warehouse']}, as_dict=True)):
		return []

	item = item[0]
	item.price = get_price(item.item_code, price_list=settings['price_list'], customer_group='', company=settings['company'])

	if item.price.formatted_discount_rate:
		_calculated_discounted_rate_and_percent(item)

	return item


@frappe.whitelist(allow_guest=True)
def get_products(
	sale: bool = False, category: str = None,
	size: str = None, color: str = None,
	start: int = 0, limit: int = 15
):
	"""
	Get a list of available products or a specific product by item_code. Includes filtering by category and its descendants.

	Parameters:
		sale (bool): Fetches only products with discounts.
		category (str): Fetches products from the specific category and its child categories.
		size (str): Fetches products with a specific size.
		color (str): Fetches products with a specific color.
		start (int): Pagination start index.
		limit (int): Number of products to fetch.

	Returns:
		List of products or a single product.
	"""
	settings = _get_ecommerce_settings()

	query = _build_base_query()
	params = {"start": start, "limit": limit, "warehouse": settings['warehouse']}

	if size:
		query += """
			AND EXISTS (
				SELECT 1
				FROM `tabItem Variant Attribute` iva_size
				WHERE iva_size.parent = item.name
					AND iva_size.attribute = 'Talla'
					AND iva_size.attribute_value IN %(size)s
			)
		"""
		params["size"] = _comma_separated_to_list(size)

	if color:
		query += """
			AND EXISTS (
				SELECT 1
				FROM `tabItem Variant Attribute` iva_color
				WHERE iva_color.parent = item.name
					AND iva_color.attribute = 'Color'
					AND iva_color.attribute_value IN %(color)s
			)
		"""
		params["color"] = _comma_separated_to_list(color)

	if sale:
		# TODO: Validate the valid_from and valid_upto dates. Nevertheless, the query should work with the disable filter.
		items_on_sale = frappe.db.sql("""
			SELECT
				pri.item_code
			FROM `tabPricing Rule Item Code` pri
			JOIN `tabPricing Rule` pr ON pr.name = pri.parent
			WHERE
				pr.disable = 0 and pr.apply_on = 'Item Code'
			AND
				(pr.valid_from <= CURDATE() AND pr.valid_upto >= CURDATE()) -- TODO: Check if valid_from is null
		""", as_dict=True, pluck='name')

		if not items_on_sale:
			return []

		query += " AND item.item_code IN %(items_on_sale)s"
		params["items_on_sale"] = items_on_sale

	if category:  # Filter by categories and their descendants
		if categories := _get_descendant_categories(_comma_separated_to_list(category)):
			query += " AND item.item_group IN %(categories)s"
			params["categories"] = categories
		else:
			return []  # Bad Item Group

	# Add Pagination # TODO: Add Sort By in Settings
	items = frappe.db.sql(query + " ORDER BY item.creation DESC LIMIT %(start)s, %(limit)s;", params, as_dict=True)

	for item in items:
		item.price = get_price(item.item_code, price_list=settings['price_list'], customer_group='', company=settings['company']) or {}

		if item.price.get('formatted_discount_rate'):
			_calculated_discounted_rate_and_percent(item)

	return items


@frappe.whitelist(allow_guest=True)
def get_categories(parent: str = 'All Item Groups'):
	# TODO: Add show_in_website Filter: UNUSED as per 24 Jun 2025
	return get_all_nodes("Item Group", '', parent, "frappe.desk.treeview.get_children", show_in_website=True)
