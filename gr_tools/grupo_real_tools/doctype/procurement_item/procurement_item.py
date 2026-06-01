from frappe.model.document import Document


class ProcurementItem(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		discount: DF.Currency
		item_code: DF.Data
		item_group: DF.Link
		item_name: DF.Data | None
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		purchase_rate: DF.Currency
		qty: DF.Int
		selling_rate: DF.Currency
		subtotal: DF.Currency
		total: DF.Currency
		unit_cost: DF.Currency
	# end: auto-generated types

	pass
