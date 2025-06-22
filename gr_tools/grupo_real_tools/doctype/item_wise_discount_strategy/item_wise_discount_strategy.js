frappe.ui.form.on("Item-wise Discount Strategy", {
	onload_post_render(frm) {
		frm.fields_dict['items'].grid.set_multiple_add('item_code');
	},

	refresh(frm) {
		// TODO: Make this refresh on field change!
		let grid = frm.fields_dict['items'].grid;
		let grid_rows = grid.form_grid.find('.grid-body .grid-row'); // Find only Displayed body Rows

		grid_rows.each((i, row) => {
			let item = grid.grid_rows_by_docname[row.getAttribute('data-name')].doc;
			let color = item.gross_profit_margin > 0 ? 'green' : 'red';  // TODO: Add 0.00

			row.querySelector("[data-fieldname='gross_profit_margin']").style.color = color;
			row.querySelector("[data-fieldname='gross_profit']").style.color = color;
		});
	}
});

frappe.ui.form.on("Item-wise Discount Strategy Item", {
	item_code(frm, cdt, cdn) {
		let item = locals[cdt][cdn];

		if (item.item_code.length <= 0) {
			return;
		}

		frappe.call({
			method: 'get_item_details',
			doc: cur_frm.doc,
			args: {
				idx: item.idx,
				item_code: item.item_code
			},
			callback: (r) => Object.assign(item, r.message),
			error: (r) => item.item_code = ''
		});
	},

	discount_price(frm, cdt, cdn) {
		let item = locals[cdt][cdn];

		frappe.call({
			method: 'calculate_item_values',
			doc: frm.doc,
			args: {item},
			callback: (r) => Object.assign(item, r.message)
		});
	}
});
