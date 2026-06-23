(() => {
	const CART_PATCH_FLAG = "__gr_pos_alt_total_patched";
	const PAYMENT_PATCH_FLAG = "__gr_pos_additional_info_queries_patched";
	const STYLE_ID = "gr-pos-alt-total-style";
	const TARGET = { USD: "NIO", NIO: "USD" };
	const rates = {};
	const has_value = (value) => value !== undefined && value !== null && value !== "";

	function inject_style() {
		if (document.getElementById(STYLE_ID)) return;

		$(`<style id="${STYLE_ID}">
			.gr-pos-alt-total { display: block !important; }
			.gr-pos-total-row { display: flex; align-items: center; justify-content: space-between; gap: var(--margin-sm); }
			.gr-pos-alt-row, .gr-pos-numpad-alt-total { color: var(--text-muted); font-size: var(--text-sm); font-weight: 500; }
			.gr-pos-alt-row { margin-top: 2px; }
			.gr-pos-total-label { min-width: 0; }
			.gr-pos-rate-label { font-size: 11px; line-height: 1.2; margin-top: 2px; }
			.gr-pos-alt-row .gr-pos-total-value, .gr-pos-numpad-alt-total span { color: var(--text-color); font-weight: 600; }
		</style>`).appendTo("head");
	}

	function get_company_currency(doc) {
		const company = doc.company ? window.locals?.Company?.[doc.company] : null;
		return doc.company_currency || company?.default_currency || frappe.boot?.sysdefaults?.currency;
	}

	function get_company_total(doc, pos_total) {
		const base_total = cint(frappe.sys_defaults.disable_rounded_total)
			? doc.base_grand_total
			: doc.base_rounded_total;

		if (has_value(base_total)) return flt(base_total);
		if (has_value(doc.base_grand_total)) return flt(doc.base_grand_total);

		return flt(pos_total) * flt(doc.conversion_rate || 1);
	}

	function get_exchange_rate(from_currency, to_currency, transaction_date) {
		const key = [from_currency, to_currency, transaction_date].join(":");
		if (!rates[key]) {
			rates[key] = frappe
				.call({
					method: "erpnext.setup.utils.get_exchange_rate",
					args: {
						from_currency,
						to_currency,
						transaction_date,
						args: "for_selling",
					},
				})
				.then((r) => flt(r.message))
				.catch(() => {
					delete rates[key];
					return null;
				});
		}

		return rates[key];
	}

	function convert_total(doc, pos_total, target_currency) {
		if (target_currency === get_company_currency(doc)) return Promise.resolve(get_company_total(doc, pos_total));

		return get_exchange_rate(
			doc.currency,
			target_currency,
			doc.posting_date || frappe.datetime.get_today()
		).then((rate) => (rate ? flt(pos_total) * rate : null));
	}

	function get_rate_label(pos_currency, target_currency, pos_total, alt_total) {
		const pos_value = flt(pos_total);
		const alt_value = flt(alt_total);
		if (!pos_value || !alt_value) return "";

		let nio_per_usd = null;
		if (pos_currency === "USD" && target_currency === "NIO") {
			nio_per_usd = alt_value / pos_value;
		}
		if (pos_currency === "NIO" && target_currency === "USD") {
			nio_per_usd = pos_value / alt_value;
		}
		if (!nio_per_usd) return "";

		return `${__("Tasa")} ${frappe.utils.escape_html(format_currency(nio_per_usd, "NIO", 4))}`;
	}

	function render_alt_total(pos_total) {
		const doc = this.events?.get_frm?.()?.doc;
		const target_currency = TARGET[doc?.currency];
		const $grand_total = this.$totals_section?.find(".grand-total-container");
		const $numpad_grand_total = this.$numpad_section?.find(".numpad-grand-total");

		if (!doc || !target_currency) {
			$grand_total?.removeClass("gr-pos-alt-total");
			$numpad_grand_total?.removeClass("gr-pos-alt-total");
			return;
		}

		const request_key = [doc.name, pos_total, target_currency].join(":");
		this._gr_pos_alt_total_request = request_key;

		convert_total(doc, pos_total, target_currency).then((alt_total) => {
			if (this._gr_pos_alt_total_request !== request_key || alt_total === null) return;

				const pos_currency = doc.currency;
				const formatted_pos_total = format_currency(pos_total, pos_currency);
				const formatted_alt_total = format_currency(alt_total, target_currency);
				const alt_label = `${__("Total")} (${frappe.utils.escape_html(target_currency)})`;
				const rate_label = get_rate_label(pos_currency, target_currency, pos_total, alt_total);

				$grand_total?.addClass("gr-pos-alt-total").html(`
					<div class="gr-pos-total-row">
						<div class="gr-pos-total-label">${__("Grand Total")}</div>
						<div class="gr-pos-total-value">${formatted_pos_total}</div>
					</div>
					<div class="gr-pos-total-row gr-pos-alt-row">
						<div class="gr-pos-total-label">
							<div>${alt_label}</div>
							${rate_label ? `<div class="gr-pos-rate-label">${rate_label}</div>` : ""}
						</div>
						<div class="gr-pos-total-value">${formatted_alt_total}</div>
					</div>
				`);

				$numpad_grand_total?.addClass("gr-pos-alt-total").html(`
					<div>${__("Grand Total")}: <span>${formatted_pos_total}</span></div>
					<div class="gr-pos-numpad-alt-total">
						${alt_label}${rate_label ? ` · ${rate_label}` : ""}: <span>${formatted_alt_total}</span>
					</div>
				`);
		});
	}

	function patch_pos_cart() {
		const item_cart = window.erpnext?.PointOfSale?.ItemCart;
		if (!item_cart) return false;
		if (item_cart.prototype[CART_PATCH_FLAG]) return true;

		const render_grand_total = item_cart.prototype.render_grand_total;
		item_cart.prototype.render_grand_total = function (value) {
			render_grand_total.call(this, value);
			render_alt_total.call(this, value);
		};

		item_cart.prototype[CART_PATCH_FLAG] = true;
		inject_style();
		return true;
	}

	function get_customer_address_query(payment) {
		const customer = payment.events?.get_frm?.()?.doc?.customer || "__no_customer_selected__";
		return {
			query: "frappe.contacts.doctype.address.address.address_query",
			filters: {
				link_doctype: "Customer",
				link_name: customer,
			},
		};
	}

	function get_customer_address_route_options(payment, fieldname) {
		const doc = payment.events?.get_frm?.()?.doc || {};
		if (!doc.customer) return {};

		const route_options = {
			address_title: doc.customer_name || doc.customer,
			country: frappe.sys_defaults.country,
			links: [
				{
					link_doctype: "Customer",
					link_name: doc.customer,
					link_title: doc.customer_name || doc.customer,
				},
			],
		};

		if (fieldname === "shipping_address_name") {
			route_options.address_type = "Shipping";
			route_options.is_shipping_address = 1;
		}

		if (fieldname === "customer_address") {
			route_options.address_type = "Billing";
			route_options.is_primary_address = 1;
		}

		return route_options;
	}

	function set_additional_info_queries(payment) {
		const address_fields = ["customer_address", "shipping_address_name"];
		(payment.invoice_fields || []).forEach((df) => {
			if (address_fields.includes(df.fieldname) && df.options === "Address") {
				df.get_query = () => get_customer_address_query(payment);
				df.get_route_options_for_new_doc = () =>
					get_customer_address_route_options(payment, df.fieldname);
			}
		});
	}

	function patch_pos_payment() {
		const payment = window.erpnext?.PointOfSale?.Payment;
		if (!payment) return false;
		if (payment.prototype[PAYMENT_PATCH_FLAG]) return true;

		const make_invoice_field_dialog = payment.prototype.make_invoice_field_dialog;
		payment.prototype.make_invoice_field_dialog = function () {
			set_additional_info_queries(this);
			make_invoice_field_dialog.call(this);
		};

		payment.prototype[PAYMENT_PATCH_FLAG] = true;
		return true;
	}

	function wait_for_pos(attempt = 0) {
		const cart_patched = patch_pos_cart();
		const payment_patched = patch_pos_payment();
		if ((cart_patched && payment_patched) || attempt >= 80) return;
		window.setTimeout(() => wait_for_pos(attempt + 1), 100);
	}

	wait_for_pos();
})();
