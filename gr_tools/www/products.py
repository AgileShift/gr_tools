import frappe
from frappe.utils import flt
from erpnext.utilities.product import get_price
from gr_tools.www.categories import _get_descendant_item_groups


def _comma_separated_to_list(value: str | None) -> list[str]:
	if not value:
		return []

	return [item.strip() for item in value.split(",") if item.strip()]


def _group_items_by_template(items: list[dict]) -> list[dict]:
	products = {}

	for item in items:
		template_code = item.get("variant_of") or item.get("item_code")

		product = products.setdefault(template_code, {
			"item_code": template_code,
			"item_name": item.pop("template_item_name", None) or item.get("item_name"),
			"image": item.get("image"),
			"item_group": item.get("item_group"),
			"price_summary": None,
			"variants": [],
		})

		product["variants"].append(item)

	for product in products.values():
		product["price_summary"] = _build_price_summary(product["variants"])

	return list(products.values())


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
			item.variant_of,
			template.item_name as template_item_name,
			(bin.actual_qty - bin.reserved_stock) as actual_qty,
			COALESCE(
				(SELECT JSON_OBJECTAGG(item_attr.attribute, item_attr.attribute_value)
				FROM `tabItem Variant Attribute` AS item_attr
				WHERE item_attr.parent = item.item_code), JSON_OBJECT()
			) as attributes
		FROM `tabBin` AS bin
		JOIN `tabItem` AS item ON item.item_code = bin.item_code
		LEFT JOIN `tabItem` AS template ON template.name = item.variant_of
		WHERE (bin.actual_qty - bin.reserved_stock) > 0 AND bin.warehouse = %(warehouse)s
	"""


def _get_item_price(item_code):
	price = get_price(
		item_code=item_code,
		price_list=frappe.get_single_value('Selling Settings', 'selling_price_list'),
		customer_group='',
		company=frappe.get_single_value('Global Defaults', 'default_company')
	) or {}

	# if price.get('formatted_discount_rate'):
		# When 'Formatted Discount Rate' is Set, other fields are empty so auto-calculated here!
		# price.mrp = float(price.formatted_mrp.replace('$', '').strip())
		# price.discount_rate = float(price.formatted_discount_rate.replace('$', '').strip())
		# price.discount_percent = round((price.discount_rate / price.mrp) * 100, 2)

	if price.get('discount_percent'):  # If there is any discount. FIXME: As Fallback?
		price.formatted_discount_percent = f"{price.discount_percent:.0f}%"

	return price


def _build_price_summary(variants: list[dict]) -> dict | None:
	prices = []
	first_price = None

	for variant in variants:
		price = variant.get("price") or {}
		price_list_rate = price.get("price_list_rate")

		if price_list_rate is None:
			continue

		if first_price is None:
			first_price = price

		prices.append(flt(price_list_rate))

	if not prices:
		return None

	min_price = min(prices)
	max_price = max(prices)

	return {
		"type": "single" if (min_price == max_price) else "range",
		"min_price": min_price,
		"max_price": max_price,
	}


@frappe.whitelist(allow_guest=True)
def get_item(item_code: str):
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


@frappe.whitelist(allow_guest=True)
def get_items_from_template(item_code: str):
	"""
	Get the template for a variant item and all available variants.

	Parameters:
		item_code (str): Variant item code used to resolve the template.

	Returns:
		Template product with available variants.
	"""
	warehouse = frappe.get_single_value('Stock Settings', 'default_warehouse')
	items = frappe.db.sql("""
		SELECT
			item.item_code,
			item.item_name,
			item.image,
			item.item_group,
			item.variant_of,
			template.item_name as template_item_name,
			(bin.actual_qty - bin.reserved_stock) as actual_qty,
			COALESCE(
				(SELECT JSON_OBJECTAGG(item_attr.attribute, item_attr.attribute_value)
				FROM `tabItem Variant Attribute` AS item_attr
				WHERE item_attr.parent = item.item_code), JSON_OBJECT()
			) as attributes
		FROM `tabBin` AS bin
		JOIN `tabItem` AS item ON item.item_code = bin.item_code
		LEFT JOIN `tabItem` AS template ON template.name = item.variant_of
		WHERE
			(item.item_code = %(item_code)s OR item.variant_of = %(item_code)s)
			AND (bin.actual_qty - bin.reserved_stock) > 0
			AND bin.warehouse = %(warehouse)s
		ORDER BY item.creation ASC
	""", {"item_code": item_code, "warehouse": warehouse}, as_dict=True)

	if not items:
		return []

	prices = []
	product = {
		"item_code": item_code,
		"item_name": items[0].pop("template_item_name", None),
		"image": items[0].pop("image", None),
		"item_group": items[0].pop("item_group", None),
		"price_summary": None,
		"variants": [],
	}

	for item in items:
		item.price = _get_item_price(item.item_code)
		item.attributes = frappe.parse_json(item.attributes)

		if item.price.get("price_list_rate") is not None:
			prices.append(flt(item.price.get("price_list_rate")))

		product["variants"].append(item)

	if prices:
		min_price = min(prices)
		max_price = max(prices)
		product["price_summary"] = {
			"type": "single" if min_price == max_price else "range",
			"min_price": min_price,
			"max_price": max_price,
		}

	return product


@frappe.whitelist(allow_guest=True, methods=['GET'])
def get_items(sale: bool = False, category: str = '', size: str = '', color: str = '', start: int = 0, limit: int = 45):
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
		if categories := _get_descendant_item_groups(_comma_separated_to_list(category)):
			params["categories"] = categories
			query += " AND item.item_group IN %(categories)s"
		else:
			return []  # Bad Item Group

	# Add Pagination # TODO: Add Sort By in Settings
	items = frappe.db.sql(query + " ORDER BY item.creation DESC LIMIT %(start)s, %(limit)s;", params, as_dict=True)

	for item in items:
		item.price = _get_item_price(item.item_code)
		item.attributes = frappe.parse_json(item.attributes)

	return _group_items_by_template(items)


@frappe.whitelist(allow_guest=True, methods=['GET'])
def get_item_attributes(attribute: str):
	""" Returns Item Attribute Values as Requested as a nested tree. """
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
