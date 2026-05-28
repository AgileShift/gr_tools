import frappe
from erpnext.utilities.product import get_price


def _comma_separated_to_list(value: str | None) -> list[str]:
	if not value:
		return []

	return [item.strip() for item in value.split(",") if item.strip()]


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


def _build_base_query():
	"""
	Query for Availability: projected_qty = actual_qty - reserved_qty | Planned | Requested | Ordered
	# actual_qty = All Items at Warehouse
	# reserved_qty = Sum of Items in Sales Orders(Not Draft) and Stock Reservation
	# projected_qty = actual_qty - reserved_qty
	# reserved_stock = Sum of Items in StockReservation

	# FIXME: Dont Show POS Reserved Stock! is like a Virtual Field?
	# TODO: Show BackOrder Products?(For future sales or pre-orders)
	"""
	return """
		SELECT
			item.item_code,
			item.item_name,
			item.image,
			item.item_group,
			(bin.actual_qty - bin.reserved_stock) as actual_qty,
			COALESCE(
				(SELECT JSON_OBJECTAGG(item_attr.attribute, item_attr.attribute_value)
				FROM `tabItem Variant Attribute` AS item_attr
				WHERE item_attr.parent = item.item_code), JSON_OBJECT()
			) as attributes
		FROM `tabBin` AS bin
		JOIN `tabItem` AS item ON item.item_code = bin.item_code
		WHERE (bin.actual_qty - bin.reserved_stock) > 0 AND bin.warehouse = %(warehouse)s
	"""


def _get_item_price(item_code):
	price = get_price(
		item_code=item_code,
		price_list=frappe.get_single_value('Selling Settings', 'selling_price_list'),
		customer_group='',
		company=frappe.get_single_value('Global Defaults', 'default_company')
	) or {}

	if price.get('formatted_discount_rate'):
		# When 'Formatted Discount Rate' is Set, other fields are empty so auto-calculated here!
		price.mrp = float(price.formatted_mrp.replace('$', '').strip())
		price.discount_rate = float(price.formatted_discount_rate.replace('$', '').strip())
		price.discount_percent = round((price.discount_rate / price.mrp) * 100, 2)

	if price.get('discount_percent'):  # If there is any discount. FIXME: As Fallback?
		price.formatted_discount_percent = f"{price.discount_percent:.0f}%"

	return price


@frappe.whitelist(allow_guest=True)
def get_product(item_code: str):
	"""
	Get a single product by item_code.

	Parameters:
		item_code (str): Fetches only the specific product.

	Returns:
		Single product.
	"""
	warehouse = frappe.get_single_value('Stock Settings', 'default_warehouse')
	query = _build_base_query() + " AND item.item_code = %(item_code)s LIMIT 1"

	if not (item := frappe.db.sql(query, {'item_code': item_code, 'warehouse': warehouse}, as_dict=True)):
		return []

	item[0].price = _get_item_price(item[0].item_code)
	item[0].attributes = frappe.parse_json(item[0].attributes)

	return item[0]


@frappe.whitelist(allow_guest=True, methods=['GET'])
def get_products(sale: bool = False, category: str = '', size: str = '', color: str = '', start: int = 0, limit: int = 15):
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
	query = _build_base_query()
	params = {
		"start": start, "limit": limit,
		"warehouse": frappe.get_single_value('Stock Settings', 'default_warehouse')
	}

	if size:
		params["sizes"] = _comma_separated_to_list(size)
		query += """
			AND EXISTS (
				SELECT 1
				FROM `tabItem Variant Attribute` iva_size
				WHERE iva_size.parent = item.name
					AND iva_size.attribute = 'Talla'
					AND iva_size.attribute_value IN %(sizes)s
			)
		"""

	if color:
		params["colors"] = _comma_separated_to_list(color)
		query += """
			AND EXISTS (
				SELECT 1
				FROM `tabItem Variant Attribute` iva_color
				WHERE iva_color.parent = item.name
					AND iva_color.attribute = 'Color'
					AND iva_color.attribute_value IN %(colors)s
			)
		"""

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
		""", as_dict=True, pluck='item_code')

		if not items_on_sale:
			return []

		query += " AND item.item_code IN %(items_on_sale)s"
		params["items_on_sale"] = items_on_sale

	if category:  # Filter by categories and their descendants
		if categories := _get_descendant_categories(_comma_separated_to_list(category)):
			params["categories"] = categories
			query += " AND item.item_group IN %(categories)s"
		else:
			return []  # Bad Item Group

	# Add Pagination # TODO: Add Sort By in Settings
	items = frappe.db.sql(query + " ORDER BY item.creation DESC LIMIT %(start)s, %(limit)s;", params, as_dict=True)

	for item in items:
		item.price = _get_item_price(item.item_code)
		item.attributes = frappe.parse_json(item.attributes)

	return items


@frappe.whitelist(allow_guest=True, methods=['GET'])
def get_categories():
	""" Returns Item Groups visible in website as a nested tree. """
	ItemGroup = frappe.qb.DocType("Item Group")

	rows = (
		frappe.qb.from_(ItemGroup)
		.select(ItemGroup.name, ItemGroup.parent_item_group, ItemGroup.is_group)
		.where(ItemGroup.show_in_website == 1)
		.orderby(ItemGroup.weightage)
	).run(as_dict=True)

	nodes = {
		row["name"]: {
			"name": row["name"],
			"parent_item_group": row["parent_item_group"],
			"is_group": bool(row["is_group"]),
			"children": [],
		}
		for row in rows
	}

	tree = []
	for row in rows:
		node = nodes[row["name"]]
		parent = nodes.get(row["parent_item_group"])

		if parent:
			parent["children"].append(node)
		else:
			tree.append(node)

	return tree


@frappe.whitelist(allow_guest=True, methods=['GET'])
def get_item_attribute_values(attribute: str):
	rows = frappe.get_all(
		"Item Attribute Value",
		filters={
			"parent": attribute,
			"parenttype": "Item Attribute",
		},
		fields=["attribute_value as value", "abbr", "idx"],
		order_by="idx asc",
	)

	return [{"value": row.value, "abbr": row.abbr} for row in rows]
