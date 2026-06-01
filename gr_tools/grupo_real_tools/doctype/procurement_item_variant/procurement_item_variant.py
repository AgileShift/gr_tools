# Copyright (c) 2025, Agile Shift and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document


class ProcurementItemVariant(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		item_attribute_value: DF.Data | None
		item_code: DF.Data
		item_variant: DF.Link
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
	# end: auto-generated types

	pass
