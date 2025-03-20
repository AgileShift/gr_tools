frappe.ui.form.on("Item-wise Discount Strategy", {
	refresh(frm) {

		let rows = document.getElementsByClassName("grid-row");

		frm.doc.items.forEach((item, i) => {
			let color = item.gross_profit_margin > 0 ? 'green' : 'red';
			let row = $(rows[i + 1]);

			row.find("[data-fieldname='gross_profit_margin']")[0].style.color = color;
			row.find("[data-fieldname='gross_profit']")[0].style.color = color;

		});

	}
});

frappe.ui.form.on("Item-wise Discount Strategy Item", {
	// TODO: Make this work on the Frontend
	item_code(frm, cdt, cdn) {
		let item = locals[cdt][cdn];

		if (item.item_code.length <= 0) {
			return;
		}

		frappe.db.get_value(
			'Bin',
			{item_code: item.item_code, warehouse: frm.doc.warehouse},
			['actual_qty', 'valuation_rate'],
			(values) => {

				if (!values.actual_qty) {
					frappe.msgprint(`Fila ${item.idx}: No se encontró stock para el artículo <bold>${item.item_code}</bold> en el almacén: ${frm.doc.warehouse}`);
					return;
				}

				item.actual_qty = values.actual_qty;
				item.valuation_rate = values.valuation_rate;

				frappe.db.get_value('Item Price', {
					item_code: item.item_code, price_list: frm.doc.price_list
				}, 'price_list_rate', (value) => {
					item.selling_rate = value.price_list_rate;

					frm.refresh_field('items');
				});

			}
		);
	},

	discount_price(frm, cdt, cdn) {
		let item = locals[cdt][cdn];

		// Auto-calculate discount price and margins
		item.discount_margin = -((item.selling_rate - item.discount_price) / item.selling_rate) * 100
		item.gross_profit_margin = ((item.discount_price - item.valuation_rate) / item.valuation_rate) * 100
		item.gross_profit = item.discount_price - item.valuation_rate

		frm.refresh_field('items');
	}
});
