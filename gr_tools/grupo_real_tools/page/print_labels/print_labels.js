frappe.pages['print-labels'].on_page_load = function(wrapper) {

	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Print Labels'),
		single_column: true
	});

	[
		{label: __('Item Name'), fieldtype: 'Data', fieldname: 'item_name'},
		{label: __('Item Group'), fieldtype: 'Link', fieldname: 'item_group', options: 'Item Group'},
		{label: __('Has Variants'), fieldtype: 'Check', fieldname: 'has_variants'},
		{label: __('Variant Of'), fieldtype: 'Link', fieldname: 'variant_of', options: 'Item'},
		{label: __('Purchase Invoice'), fieldtype: 'Link', fieldname: 'purchase_invoice', options: 'Purchase Invoice'},
		{label: __('Pricing Rule'), fieldtype: 'Link', fieldname: 'pricing_rule', options: 'Pricing Rule'}
	].forEach((df) => {
		page[df.fieldname] = page.add_field({
			label: df.label,
			fieldtype: df.fieldtype,
			fieldname: df.fieldname,
			options: df.options,
			change() {
				load_products();
			}
		});
	});

	page.container.on('click', 'button.raw-print', function (e) {

		frappe.ui.form
			.qz_connect()
			.then(function () {
				let printer_map = JSON.parse(localStorage.print_format_printer_map).Item[0];
				let config = qz.configs.create(printer_map.printer);

				frappe.call({
					method: "frappe.www.printview.get_rendered_raw_commands",
					args: {
						doc: 'Item', name: e.target.id,
						print_format: 'Item Label With Price',
						_lang: this.lang_code,
					}
				}).then((r) => {
					if (!r.exc) {
						console.log(r.message.raw_commands)

						return qz.print(config, [r.message.raw_commands]).then(function () {
							console.log('data sent')
						});
					}
				});
			})
			.then(frappe.ui.form.qz_success)
			.catch((err) => {
				frappe.ui.form.qz_fail(err);
			});

	});

	function load_products() {
		if (page.pricing_rule.value) {
			frappe.call({
				method: 'gr_tools.grupo_real_tools.page.print_labels.print_labels.get_products',
				args: {pricing_rule: page.pricing_rule.value},
				debounce: 1000,
			}).then((r) => {
				render_template({items: r.message});
			});
		} else {
			// TODO: WORK in Progress
			frappe.call({
				debounce: 1000,
				method: 'gr_tools.www.products.get_products',
				args: {
					start: 0,
					limit: 20,
				}, callback: (r) => {
					render_template({items: r.message})
				}
			});
		}

	}

	function render_template(context) {
		const wrapper_selector = '.table-responsive';
		// TODO IMPROVE THE WRAPPER SELECTOR
		if (page.wrapper.find(wrapper_selector).length) {
			page.wrapper.find(wrapper_selector).html(frappe.render_template('print_labels', context));
		} else {
			$(frappe.render_template('print_labels', context)).appendTo(page.container);
		}
	}
}
