import os

import frappe
from frappe.modules.import_file import read_doc_from_file


def after_migrate():
	# See: def import_fixtures(app): on fixtures.py(Frappe Core)
	fixtures_folder_path = frappe.get_app_path('gr_tools', "custom_fixtures")

	frappe.flags.mute_emails = frappe.flags.in_import = True

	for fixture in os.listdir(fixtures_folder_path):
		print(f"GR Tools: Applying Fixture -> {fixture}...")

		data = read_doc_from_file(os.path.join(fixtures_folder_path, fixture))
		doctype = frappe.unscrub(fixture.split(".")[0])  # eg: "doc_type.json" -> "Doc Type"

		apply_settings(doctype, data)

	frappe.flags.mute_emails = frappe.flags.in_import = False


def apply_settings(doctype, data):
	global_settings = data['global']

	# Apply site-specific settings
	if site_settings := data.get(frappe.local.site):
		global_settings.update(site_settings)

	doc = frappe.get_doc(doctype)  # Works For Single Doctypes

	for key, value in global_settings.items():
		setattr(doc, key, value)

	doc.save()
	frappe.db.commit()
