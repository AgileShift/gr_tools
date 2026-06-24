(() => {
	const CART_PATCH_FLAG = "__gr_pos_alt_total_patched";
	const PAYMENT_PATCH_FLAG = "__gr_pos_additional_info_queries_patched";
	const ITEM_DETAILS_PATCH_FLAG = "__gr_pos_item_details_patched";
	const TARGET = { USD: "NIO", NIO: "USD" };
	const BRAND_PINK = "#f7c6c8";
	const exchange_rates = new Map();
	const cart_images = new Map();
	const has_value = (value) => value !== undefined && value !== null && value !== "";

	function get_doc(component) {
		return component?.events?.get_frm?.()?.doc || {};
	}

	function get_grand_total(doc) {
		return cint(frappe.sys_defaults.disable_rounded_total)
			? doc.grand_total
			: doc.rounded_total;
	}

	function get_company_currency(doc) {
		const company = doc.company ? window.locals?.Company?.[doc.company] : null;
		return (
			doc.company_currency || company?.default_currency || frappe.boot?.sysdefaults?.currency
		);
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
		if (!exchange_rates.has(key)) {
			const request = frappe
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
					exchange_rates.delete(key);
					return null;
				});
			exchange_rates.set(key, request);
		}

		return exchange_rates.get(key);
	}

	function convert_total(doc, pos_total, target_currency) {
		if (target_currency === get_company_currency(doc))
			return Promise.resolve(get_company_total(doc, pos_total));

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
		const doc = get_doc(this);
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

	function wrap_canvas_text(context, text, max_width) {
		const words = String(text || "")
			.trim()
			.split(/\s+/);
		const lines = [];
		let line = "";

		words.forEach((word) => {
			const candidate = line ? `${line} ${word}` : word;
			if (line && context.measureText(candidate).width > max_width) {
				lines.push(line);
				line = word;
			} else {
				line = candidate;
			}
		});
		if (line) lines.push(line);
		return lines.length ? lines : [""];
	}

	function draw_canvas_line(context, x1, y, x2, color = "#d1d5db") {
		context.beginPath();
		context.moveTo(x1, y);
		context.lineTo(x2, y);
		context.strokeStyle = color;
		context.lineWidth = 1;
		context.stroke();
	}

	function draw_rounded_rect(context, x, y, width, height, radius, fill) {
		const safe_radius = Math.min(radius, width / 2, height / 2);
		context.beginPath();
		context.moveTo(x + safe_radius, y);
		context.lineTo(x + width - safe_radius, y);
		context.quadraticCurveTo(x + width, y, x + width, y + safe_radius);
		context.lineTo(x + width, y + height - safe_radius);
		context.quadraticCurveTo(x + width, y + height, x + width - safe_radius, y + height);
		context.lineTo(x + safe_radius, y + height);
		context.quadraticCurveTo(x, y + height, x, y + height - safe_radius);
		context.lineTo(x, y + safe_radius);
		context.quadraticCurveTo(x, y, x + safe_radius, y);
		context.closePath();
		context.fillStyle = fill;
		context.fill();
	}

	function load_canvas_image(source) {
		if (!source) return Promise.resolve(null);
		if (cart_images.has(source)) return cart_images.get(source);

		const request = new Promise((resolve) => {
			const image = new Image();
			let settled = false;
			const finish = (value) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timeout);
				image.onload = null;
				image.onerror = null;
				resolve(value);
			};
			const timeout = window.setTimeout(() => finish(null), 10000);

			image.crossOrigin = "anonymous";
			image.onload = () => finish(image);
			image.onerror = () => finish(null);
			image.src = source;
		}).then((image) => {
			if (!image) cart_images.delete(source);
			return image;
		});

		cart_images.set(source, request);
		return request;
	}

	function draw_product_image(context, image, item_name, x, y, size) {
		draw_rounded_rect(context, x, y, size, size, 16, "#f3f4f6");

		if (!image) {
			context.fillStyle = "#9ca3af";
			context.font = "700 30px Arial, sans-serif";
			context.textAlign = "center";
			context.textBaseline = "middle";
			context.fillText(frappe.get_abbr(item_name || ""), x + size / 2, y + size / 2);
			context.textAlign = "left";
			context.textBaseline = "top";
			return;
		}

		const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
		const width = image.naturalWidth * scale;
		const height = image.naturalHeight * scale;

		context.save();
		draw_rounded_rect(context, x, y, size, size, 16, "#f3f4f6");
		context.clip();
		context.drawImage(image, x + (size - width) / 2, y + (size - height) / 2, width, height);
		context.restore();
	}

	async function make_cart_image(item_cart) {
		const doc = get_doc(item_cart);
		const items = doc.items || [];
		if (!items.length) {
			frappe.show_alert({
				message: __("Add items to the cart first."),
				indicator: "orange",
			});
			return null;
		}

		const currency = doc.currency;
		const grand_total = get_grand_total(doc);
		const target_currency = TARGET[currency];
		const alt_total = target_currency
			? await convert_total(doc, grand_total, target_currency)
			: null;
		const taxes = (doc.taxes || []).filter((tax) => flt(tax.tax_amount_after_discount_amount));

		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d");
		const width = 1080;
		const padding = 64;
		const content_width = width - padding * 2;
		const image_size = 112;
		const product_width = 520;
		const line_height = 32;

		canvas.width = width;
		context.font = "700 25px Arial, sans-serif";
		const item_rows = items.map((item) => {
			const lines = wrap_canvas_text(
				context,
				item.item_name || item.item_code,
				product_width
			);
			return { item, lines, height: Math.max(150, lines.length * line_height + 74) };
		});
		const summary_height = 20 + (2 + taxes.length) * 36;
		const total_height = alt_total !== null ? 130 : 104;
		const height =
			320 +
			item_rows.reduce((total, row) => total + row.height, 0) +
			18 +
			summary_height +
			24 +
			total_height +
			60;
		const product_images = await Promise.all(
			items.map((item) => load_canvas_image(item.image))
		);
		const missing_image = product_images.findIndex((image) => !image);
		if (missing_image !== -1) {
			throw new Error(
				__("Could not load the image for {0}.", [
					frappe.utils.escape_html(
						items[missing_image].item_name || items[missing_image].item_code
					),
				])
			);
		}

		canvas.height = height;
		context.fillStyle = BRAND_PINK;
		context.fillRect(0, 0, width, height);
		context.textBaseline = "top";

		context.fillStyle = BRAND_PINK;
		context.fillRect(0, 0, width, 200);

		draw_rounded_rect(context, padding, 34, 76, 76, 20, "#ffffff");
		context.fillStyle = "#111827";
		context.font = "800 27px Arial, sans-serif";
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.fillText(frappe.get_abbr(doc.company), padding + 38, 72);
		context.textAlign = "left";
		context.textBaseline = "top";

		context.fillStyle = "#111827";
		context.font = "800 38px Arial, sans-serif";
		context.fillText(doc.company, padding + 104, 36);
		context.fillStyle = "#6b3940";
		context.font = "700 18px Arial, sans-serif";
		context.fillText("RESUMEN DE COMPRA", padding + 106, 88);

		context.textAlign = "right";
		context.fillStyle = "#6b3940";
		context.font = "600 17px Arial, sans-serif";
		context.fillText("FECHA", width - padding, 42);
		context.fillStyle = "#111827";
		context.font = "700 22px Arial, sans-serif";
		context.fillText(
			frappe.datetime.str_to_user(doc.posting_date || frappe.datetime.get_today()),
			width - padding,
			71
		);
		context.textAlign = "left";

		draw_rounded_rect(context, 40, 140, width - 80, height - 160, 28, "#ffffff");

		let y = 170;
		context.fillStyle = "#6b7280";
		context.font = "700 16px Arial, sans-serif";
		context.fillText("PREPARADO PARA", padding, y);
		context.fillStyle = "#111827";
		context.font = "800 29px Arial, sans-serif";
		context.fillText(doc.customer_name || doc.customer || "Cliente", padding, y + 28);
		y += 82;

		draw_canvas_line(context, padding, y, width - padding, "#e5e7eb");
		y += 26;

		context.fillStyle = "#6b7280";
		context.font = "700 16px Arial, sans-serif";
		context.fillText(
			`${items.length} ${items.length === 1 ? "PRODUCTO" : "PRODUCTOS"}`,
			padding,
			y
		);
		y += 42;

		item_rows.forEach(({ item, lines, height: row_height }, index) => {
			draw_product_image(
				context,
				product_images[index],
				item.item_name || item.item_code,
				padding,
				y,
				image_size
			);

			context.fillStyle = "#111827";
			context.font = "700 24px Arial, sans-serif";
			lines.forEach((line, index) => {
				context.fillText(line, padding + image_size + 24, y + 4 + index * line_height);
			});

			context.fillStyle = "#6b7280";
			context.font = "500 17px Arial, sans-serif";
			context.fillText(
				item.item_code || "",
				padding + image_size + 24,
				y + lines.length * line_height + 10
			);
			context.fillStyle = "#374151";
			context.font = "600 18px Arial, sans-serif";
			context.fillText(
				`${item.qty} ${item.uom || ""} × ${format_currency(item.rate, currency)}`,
				padding + image_size + 24,
				y + lines.length * line_height + 40
			);

			context.fillStyle = "#111827";
			context.font = "800 25px Arial, sans-serif";
			context.textAlign = "right";
			context.fillText(format_currency(item.amount, currency), width - padding, y + 42);
			context.textAlign = "left";

			y += row_height;
			if (index < item_rows.length - 1) {
				draw_canvas_line(context, padding, y - 14, width - padding, "#e5e7eb");
			}
		});

		y += 18;
		draw_rounded_rect(context, padding, y, content_width, summary_height, 18, "#fdf1f2");
		let summary_y = y + 20;
		const draw_summary = (label, value) => {
			context.fillStyle = "#4b5563";
			context.font = "600 19px Arial, sans-serif";
			context.fillText(label, padding + 24, summary_y);
			context.fillStyle = "#111827";
			context.font = "700 20px Arial, sans-serif";
			context.textAlign = "right";
			context.fillText(value, width - padding - 24, summary_y);
			context.textAlign = "left";
			summary_y += 36;
		};

		draw_summary(
			"Cantidad total",
			String(items.reduce((total, item) => total + flt(item.qty), 0))
		);
		draw_summary("Subtotal", format_currency(doc.net_total, currency));
		taxes.forEach((tax) =>
			draw_summary(
				tax.description || "Cargo",
				format_currency(tax.tax_amount_after_discount_amount, currency)
			)
		);
		y += summary_height + 24;

		draw_rounded_rect(context, padding, y, content_width, total_height, 20, "#111827");
		context.fillStyle = "#d1d5db";
		context.font = "700 18px Arial, sans-serif";
		context.fillText("TOTAL A PAGAR", padding + 28, y + 24);
		context.fillStyle = "#ffffff";
		context.font = "800 32px Arial, sans-serif";
		context.textAlign = "right";
		context.fillText(format_currency(grand_total, currency), width - padding - 28, y + 18);
		context.textAlign = "left";

		if (alt_total !== null) {
			const rate_label = get_rate_label(currency, target_currency, grand_total, alt_total);
			context.fillStyle = "#9ca3af";
			context.font = "600 16px Arial, sans-serif";
			context.fillText(`Equivalente en ${target_currency}`, padding + 28, y + 72);
			if (rate_label) {
				context.fillText(rate_label, padding + 28, y + 96);
			}
			context.fillStyle = BRAND_PINK;
			context.font = "800 30px Arial, sans-serif";
			context.textAlign = "right";
			context.fillText(
				format_currency(alt_total, target_currency),
				width - padding - 28,
				y + 77
			);
			context.textAlign = "left";
		}

		context.fillStyle = "#df717e";
		context.font = "600 17px Arial, sans-serif";
		context.textAlign = "center";
		context.fillText(__("Gracias por elegir {0}", [doc.company]), width / 2, height - 42);
		context.textAlign = "left";

		return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
	}

	function download_cart_image(blob, doc) {
		if (!blob) return;

		const customer = (doc.customer_name || doc.customer || "customer")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		const filename = `item-cart-${customer || "customer"}-${frappe.datetime.get_today()}.png`;
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		link.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 1000);
		frappe.show_alert({ message: __("Cart image downloaded."), indicator: "green" });
	}

	function show_cart_image_preview(blob, doc) {
		if (!blob) return;

		const url = URL.createObjectURL(blob);
		const dialog = new frappe.ui.Dialog({
			title: __("Cart Image"),
			fields: [
				{
					fieldtype: "HTML",
					fieldname: "preview",
					options: `<img class="gr-pos-cart-preview" src="${url}" alt="${__(
						"Cart Image"
					)}">`,
				},
			],
			primary_action_label: __("Download"),
			primary_action: () => {
				download_cart_image(blob, doc);
				dialog.hide();
			},
		});

		dialog.$wrapper.one("hidden.bs.modal", () => URL.revokeObjectURL(url));
		dialog.show();
	}

	function mount_cart_capture_button(item_cart) {
		const $label = item_cart?.$component?.find(".cart-label");
		if (!$label?.length || $label.find(".gr-pos-capture-cart").length) return;

		$label.addClass("gr-pos-cart-label");
		const $button = $("<button>", {
			class: "gr-pos-capture-cart",
			type: "button",
			title: __("Download cart image"),
			html: frappe.utils.icon("camera", "sm"),
		}).appendTo($label);

		$button.on("click", async (event) => {
			event.preventDefault();
			event.stopPropagation();
			$button.prop("disabled", true);
			try {
				const doc = get_doc(item_cart);
				const blob = await make_cart_image(item_cart);
				show_cart_image_preview(blob, doc);
			} catch (error) {
				console.error(error);
				frappe.show_alert({
					message: error.message || __("Could not create cart image."),
					indicator: "red",
				});
			} finally {
				$button.prop("disabled", false);
			}
		});
	}

	function patch_pos_cart() {
		const item_cart = window.erpnext?.PointOfSale?.ItemCart;
		if (!item_cart) return false;
		if (item_cart.prototype[CART_PATCH_FLAG]) return true;

		const init_component = item_cart.prototype.init_component;
		item_cart.prototype.init_component = function () {
			init_component.call(this);
			mount_cart_capture_button(this);
		};

		const render_grand_total = item_cart.prototype.render_grand_total;
		item_cart.prototype.render_grand_total = function (value) {
			render_grand_total.call(this, value);
			render_alt_total.call(this, value);
		};

		const toggle_item_highlight = item_cart.prototype.toggle_item_highlight;
		item_cart.prototype.toggle_item_highlight = function (item) {
			toggle_item_highlight.call(this, item);
			this.$cart_container.find(".cart-item-wrapper").removeClass("gr-pos-cart-item-active");
			if (item && this.item_is_selected) {
				$(item).addClass("gr-pos-cart-item-active");
			}
		};

		item_cart.prototype[CART_PATCH_FLAG] = true;
		mount_cart_capture_button(window.cur_pos?.cart);
		return true;
	}

	function update_stock_badge(item_details, value) {
		const qty = flt(value);
		let $badge = item_details.$component.find(".gr-pos-stock-badge");
		if (!$badge.length) {
			$badge = $('<div class="gr-pos-stock-badge" aria-live="polite">').insertAfter(
				item_details.$item_price
			);
		}

		$badge.attr("data-empty", qty > 0 ? "0" : "1").text(`${__("In Stock")}: ${qty}`);
	}

	function style_item_detail_fields(item_details, item) {
		const primary_fields = ["qty", "rate", "discount_percentage"];
		const supporting_fields = [
			"uom",
			"conversion_factor",
			"warehouse",
			"actual_qty",
			"price_list_rate",
		];

		primary_fields.forEach((fieldname) => {
			item_details.$form_container
				.find(`.${fieldname}-control`)
				.addClass("gr-pos-primary-field");
		});
		supporting_fields.forEach((fieldname) => {
			item_details.$form_container
				.find(`.${fieldname}-control`)
				.addClass("gr-pos-supporting-field");
		});

		update_stock_badge(item_details, item.actual_qty);
		const actual_qty_control = item_details.actual_qty_control;
		if (actual_qty_control && !actual_qty_control.__gr_pos_stock_badge_patched) {
			const set_value = actual_qty_control.set_value.bind(actual_qty_control);
			actual_qty_control.set_value = function (value, ...args) {
				const result = set_value(value, ...args);
				update_stock_badge(item_details, value);
				return result;
			};
			actual_qty_control.__gr_pos_stock_badge_patched = true;
		}
	}

	function patch_pos_item_details() {
		const item_details = window.erpnext?.PointOfSale?.ItemDetails;
		if (!item_details) return false;
		if (item_details.prototype[ITEM_DETAILS_PATCH_FLAG]) return true;

		const render_form = item_details.prototype.render_form;
		item_details.prototype.render_form = function (item) {
			render_form.call(this, item);
			style_item_detail_fields(this, item);
		};

		item_details.prototype[ITEM_DETAILS_PATCH_FLAG] = true;
		return true;
	}

	function get_customer_address_query(payment) {
		const customer = get_doc(payment).customer || "__no_customer_selected__";
		return {
			query: "frappe.contacts.doctype.address.address.address_query",
			filters: {
				link_doctype: "Customer",
				link_name: customer,
			},
		};
	}

	function get_customer_address_route_options(payment, fieldname) {
		const doc = get_doc(payment);
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

	function sync_additional_info_dialog(payment) {
		const doc = get_doc(payment);
		(payment.addl_dlg?.fields_list || []).forEach((control) => {
			const df = control.df;
			if (!df?.fieldname || typeof control.set_value !== "function") return;

			const value = has_value(doc[df.fieldname])
				? doc[df.fieldname]
				: df.default_value ?? "";
			control.set_value(value);
		});
	}

	function show_additional_info_dialog(payment) {
		payment.make_invoice_field_dialog();
		if (!payment.addl_dlg) return;

		sync_additional_info_dialog(payment);
		payment.addl_dlg.show();
	}

	function mount_cart_additional_info_button(payment) {
		if (!payment?.invoice_fields?.length) return;

		const $totals = payment.wrapper.find(".customer-cart-container .cart-totals-section");
		if (!$totals.length || $totals.find(".gr-pos-cart-additional-info").length) return;

		const $button = $("<button>", {
			class: "gr-pos-cart-additional-info",
			type: "button",
			html: `${frappe.utils.icon("edit", "sm")}<span>${__(
				"Update Additional Information"
			)}</span>`,
		});

		$button.on("click", () => show_additional_info_dialog(payment));
		$totals.find(".add-discount-wrapper").before($button);
	}

	function render_payment_references() {
		const payments = get_doc(this).payments || [];
		this.$payment_modes.find(".gr-pos-payment-check, .gr-pos-payment-reference-row").remove();
		this.$payment_modes.find(".mode-of-payment").removeClass("gr-pos-payment-applied");

		payments
			.filter((payment) => flt(payment.amount))
			.forEach((payment) => {
				const mode = this.sanitize_mode_of_payment(payment.mode_of_payment);
				const $payment_mode = this.$payment_modes.find(
					`.mode-of-payment[data-mode="${mode}"]`
				);
				if (!$payment_mode.length) return;

				$payment_mode.addClass("gr-pos-payment-applied").prepend(
					$("<span>", {
						class: "gr-pos-payment-check",
						"aria-hidden": "true",
						html: frappe.utils.icon("check", "xs"),
					})
				);
				const $reference_row = $('<div class="gr-pos-payment-reference-row">').appendTo(
					$payment_mode
				);

				const $input = $("<input>", {
					class: "form-control input-xs gr-pos-payment-reference",
					type: "text",
					placeholder: __("Reference No"),
				})
					.val(payment.reference_no || "")
					.appendTo($reference_row);

				const $clear_button = $("<button>", {
					class: "btn btn-default btn-xs gr-pos-clear-payment",
					type: "button",
					title: __("Clear payment"),
					html: frappe.utils.icon("close", "xs", "es-icon"),
				}).appendTo($reference_row);

				$input.on("keydown", (event) => event.stopPropagation());
				$input.on("change", () => {
					frappe.model.set_value(
						payment.doctype,
						payment.name,
						"reference_no",
						$input.val().trim()
					);
				});

				$clear_button.on("click", async (event) => {
					event.preventDefault();
					event.stopPropagation();

					try {
						const control = this[`${mode}_control`];
						if (control) {
							await control.set_value(0);
						} else {
							await frappe.model.set_value(
								payment.doctype,
								payment.name,
								"amount",
								0
							);
						}
						await frappe.model.set_value(
							payment.doctype,
							payment.name,
							"reference_no",
							""
						);
						this.update_totals_section();
						this.render_payment_mode_dom();
					} catch (error) {
						console.error(error);
						frappe.show_alert({
							message: __("Could not clear the payment."),
							indicator: "red",
						});
					}
				});
			});
	}

	function validate_bank_payment_references() {
		const payments = get_doc(this).payments || [];
		const payment = payments.find(
			(payment) =>
				payment.type === "Bank" &&
				flt(payment.amount) &&
				!String(payment.reference_no || "").trim()
		);

		if (!payment) return true;

		const mode = this.sanitize_mode_of_payment(payment.mode_of_payment);
		frappe.show_alert({
			message: __("Enter a reference number for {0}.", [
				frappe.utils.escape_html(payment.mode_of_payment),
			]),
			indicator: "orange",
		});
		this.$payment_modes
			.find(`.mode-of-payment[data-mode="${mode}"] .gr-pos-payment-reference`)
			.focus();
		return false;
	}

	function patch_pos_payment() {
		const payment = window.erpnext?.PointOfSale?.Payment;
		if (!payment) return false;
		if (payment.prototype[PAYMENT_PATCH_FLAG]) return true;

		const init_component = payment.prototype.init_component;
		payment.prototype.init_component = function () {
			init_component.call(this);
			mount_cart_additional_info_button(this);
		};

		const render_payment_mode_dom = payment.prototype.render_payment_mode_dom;
		payment.prototype.render_payment_mode_dom = function () {
			render_payment_mode_dom.call(this);
			render_payment_references.call(this);
		};

		const make_invoice_field_dialog = payment.prototype.make_invoice_field_dialog;
		payment.prototype.make_invoice_field_dialog = function () {
			set_additional_info_queries(this);
			if (this.addl_dlg) {
				sync_additional_info_dialog(this);
				return;
			}
			make_invoice_field_dialog.call(this);
		};

		const validate_reqd_invoice_fields = payment.prototype.validate_reqd_invoice_fields;
		payment.prototype.validate_reqd_invoice_fields = function () {
			return (
				validate_reqd_invoice_fields.call(this) &&
				validate_bank_payment_references.call(this)
			);
		};

		payment.prototype[PAYMENT_PATCH_FLAG] = true;
		mount_cart_additional_info_button(window.cur_pos?.payment);
		return true;
	}

	function wait_for_pos(attempt = 0) {
		const cart_patched = patch_pos_cart();
		const payment_patched = patch_pos_payment();
		const item_details_patched = patch_pos_item_details();
		if ((cart_patched && payment_patched && item_details_patched) || attempt >= 80) {
			return;
		}
		window.setTimeout(() => wait_for_pos(attempt + 1), 100);
	}

	frappe.require("/assets/gr_tools/css/point_of_sale.css");
	wait_for_pos();
})();
