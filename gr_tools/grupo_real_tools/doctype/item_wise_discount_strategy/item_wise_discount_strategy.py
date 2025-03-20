import frappe
from frappe.model.document import Document


class ItemwiseDiscountStrategy(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF
		from gr_tools.grupo_real_tools.doctype.item_wise_discount_strategy_item.item_wise_discount_strategy_item import ItemwiseDiscountStrategyItem

		items: DF.Table[ItemwiseDiscountStrategyItem]
		price_list: DF.Link
		warehouse: DF.Link
	# end: auto-generated types

	def get_item_details(self, idx: int, item_code: str) -> dict[float, float, float]:
		item = frappe.db.get_values('Bin', {'item_code': item_code, 'warehouse': self.warehouse}, ['actual_qty', 'valuation_rate'], as_dict=True)[0]

		if item.actual_qty == 0:
			frappe.throw(f'Fila {idx}: No se encontró stock para el artículo <bold>{item_code}</bold> en el almacén: {self.warehouse}')

		item.selling_rate = frappe.db.get_value('Item Price', {'item_code': item_code, 'price_list': self.price_list}, 'price_list_rate')

		return item

	def before_save(self):

		for item in self.items:
			item.update(self.get_item_details(item.idx, item.item_code))  # Get Item Stock and Selling Price

			# Auto-calculate discount price and margins
			item.discount_margin = -((item.selling_rate - item.discount_price) / item.selling_rate) * 100
			item.gross_profit_margin = ((item.discount_price - item.valuation_rate) / item.valuation_rate) * 100
			item.gross_profit = item.discount_price - item.valuation_rate
