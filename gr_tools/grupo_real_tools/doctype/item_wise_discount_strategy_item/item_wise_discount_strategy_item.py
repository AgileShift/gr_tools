from frappe.model.document import Document


class ItemwiseDiscountStrategyItem(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		actual_qty: DF.Float
		discount_margin: DF.Percent
		discount_price: DF.Currency
		gross_profit: DF.Currency
		gross_profit_margin: DF.Percent
		item_code: DF.Link
		item_name: DF.ReadOnly | None
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		selling_rate: DF.Currency
		valuation_rate: DF.Currency
	# end: auto-generated types
	pass
