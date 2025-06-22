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

	@frappe.whitelist()
	def get_item_details(self, idx: int, item_code: str) -> dict:
		# Get Item Stock: QTY and Valuation from a Warehouse
		item = frappe.db.get_values('Bin', {'item_code': item_code, 'warehouse': self.warehouse}, ['actual_qty', 'valuation_rate'], as_dict=True)[0]

		if item.actual_qty == 0:
			frappe.throw(f'Fila {idx}: No se encontró stock para el artículo <b>{item_code}</b> en el almacén: {self.warehouse}')

		# Get Selling Price from a Price List(If there is stock)
		item.selling_rate = frappe.db.get_value('Item Price', {'item_code': item_code, 'price_list': self.price_list}, 'price_list_rate')

		return item

	@classmethod
	@frappe.whitelist()
	def calculate_item_values(cls, item) -> dict[str, float]:
		return {
			'discount_margin': ((item.get('selling_rate') - item.get('discount_price')) / item.get('selling_rate')) * 100,
			'gross_profit_margin': ((item.get('discount_price') - item.get('valuation_rate')) / item.get('valuation_rate')) * 100,
			'gross_profit': item.get('discount_price') - item.get('valuation_rate')
		}

	def before_save(self):
		# Calculate Item Details and Margins

		total_items = len(self.items)
		for i, item in enumerate(self.items):
			frappe.publish_progress(
				percent=(i + 1) / total_items * 100,
				title='Calculando valores de descuentos',
				description=f'Calculando valores para el artículo: {item.item_code}'
			)

			item.update(self.get_item_details(item.idx, item.item_code))  # Get Item Stock Values and Selling Price Rate
			item.update(self.calculate_item_values(item))  # Calculate Discount Fields
