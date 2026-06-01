from frappe.model.document import Document


class Procurement(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF
		from gr_tools.grupo_real_tools.doctype.procurement_item.procurement_item import ProcurementItem
		from gr_tools.grupo_real_tools.doctype.procurement_item_variant.procurement_item_variant import ProcurementItemVariant

		discount: DF.Currency
		items: DF.Table[ProcurementItem]
		procurement_item_variant: DF.Table[ProcurementItemVariant]
		subtotal: DF.Currency
		supplier_invoice: DF.Data
		supplier_invoice_date: DF.Date
		test: DF.Data | None
		total: DF.Currency
		total_qty: DF.Float
		tracking_number: DF.Data | None
		transportation_method: DF.Literal["SEA", "AIR"]
		transporter_invoice_date: DF.Date | None
		transporter_invoice_no: DF.Data | None
	# end: auto-generated types

	def before_validate(self):
		self.total_qty, self.subtotal, self.discount, self.total = 0.00, 0.00, 0.00, 0.00

		for item in self.items:
			item.subtotal = item.qty * item.purchase_rate
			item.total = item.subtotal - item.discount
			item.unit_cost = item.total / item.qty

			self.total_qty += item.qty
			self.subtotal += item.subtotal
			self.discount += item.discount
			self.total += item.total
