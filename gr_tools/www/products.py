import frappe
from erpnext.utilities.product import get_price
from frappe.desk.treeview import get_all_nodes


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


def _get_descendant_categories(parent_category: str) -> list[str]:
	# Get all descendant categories
	descendant_groups = frappe.db.sql("""
		WITH RECURSIVE category_tree AS (
			SELECT name FROM `tabItem Group` WHERE name = %(category)s
			UNION ALL
			SELECT ig.name
			FROM `tabItem Group` ig
			INNER JOIN category_tree ct ON ig.parent_item_group = ct.name
		)
		SELECT name FROM category_tree;
		""", {"category": parent_category}, pluck='name')
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
def get_products(sale: bool = False, category: str = None, start: int = 0, limit: int = 15):
	"""
	Get a list of available products or a specific product by item_code. Includes filtering by category and its descendants.

	Parameters:
		discounted (bool): Fetches only products with discounts.
		category (str): Fetches products from the specific category and its child categories.
		start (int): Pagination start index.
		limit (int): Number of products to fetch.

	Returns:
		List of products or a single product.
	"""
	settings = _get_ecommerce_settings()

	query = _build_base_query()

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
		query += " AND item.item_code IN %(items_on_sale)s"
	elif category:  # Filter by category and its descendants
		if categories := _get_descendant_categories(category):
			query += " AND item.item_group IN %(categories)s"
		else:
			return []  # Bad Item Group

	# Add Pagination
	items = frappe.db.sql(query + " ORDER BY item.creation ASC LIMIT %(start)s, %(limit)s;", { # TODO: Add Sort By in Settings
		"start": start, "limit": limit, "warehouse": settings['warehouse'],
		"categories": categories if category else None,
		"items_on_sale": items_on_sale if sale else None
	}, as_dict=True)

	for item in items:
		item.price = get_price(item.item_code, price_list=settings['price_list'], customer_group='', company=settings['company'])

		if item.price.formatted_discount_rate:
			_calculated_discounted_rate_and_percent(item)

	return items


@frappe.whitelist(allow_guest=True)
def get_categories(parent: str = 'All Item Groups'):
	# TODO: Add show_in_website Filter: UNUSED as per 24 Jun 2025
	return get_all_nodes("Item Group", '', parent, "frappe.desk.treeview.get_children", show_in_website=True)
