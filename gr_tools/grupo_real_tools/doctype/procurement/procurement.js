frappe.ui.form.on("Procurement", {
	setup(frm) {},

	refresh(frm) {
		let grid_rows = frm.fields_dict['items'].grid.form_grid.find('.grid-body .grid-row'); // Find only Body Rows

		frm.doc.items.forEach((item, i) => {
			let row = $(grid_rows[i]);

			row.find("[data-fieldname='discount']")[0].style.backgroundColor = '#f4cccc';
			row.find("[data-fieldname='total']")[0].style.backgroundColor = '#d9ead3';
			row.find("[data-fieldname='unit_cost']")[0].style.backgroundColor = '#d9ead3';

		});
	}

});

frappe.ui.form.on("Procurement Item", {

	create_variants_btn(frm, cdt, cdn) {
		const row = locals[cdt][cdn];

		let d = new frappe.ui.Dialog({
			title: 'Select Item Variants',
			fields: [
				{
					fieldname: 'item_attributes',
					fieldtype: 'Table',
					fields: [
						{
							label: 'Attribute',
							fieldname: 'attribute',
							fieldtype: 'Link',
							options: 'Item Attribute',
							in_list_view: true,
							onchange(e) {
								let attribute = e.get_value();
							}
						},
						{
							label: 'Attribute Value',
							fieldname: 'attribute_value',
							fieldtype: 'Link',
							options: 'Item Attribute Value',
							in_list_view: true,
						}
					]
				}
			]
		})
		d.show();

		// new frappe.ui.form.MultiSelectDialog({
		// 	doctype: "Item Attribute",
		// 	target: frm,
		// 	setters: {},
		// 	allow_child_item_selection: 1,
		// 	child_fieldname: 'item_attribute_values',
		// 	child_columns: ['attribute_value', 'abbr'],
		//
		// 	action(selections, args) {
		//
		// 		frm.add_child('procurement_item_variant', {
		// 			'item_code': row.item_code,
		// 			'item_variant': selections[0],
		// 			'item_attribute_value': JSON.stringify(args.filtered_children)
		// 		});
		// 		frm.refresh_field('procurement_item_variant');
		// 	}
		//
		// });
	}

})
