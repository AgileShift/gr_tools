import frappe
from grupo_real_tools.ecommerce.api.item import _get_item_price


@frappe.whitelist(allow_guest=False, methods='GET')
def get_erpnext_price(item_code):
	return _get_item_price(item_code)
