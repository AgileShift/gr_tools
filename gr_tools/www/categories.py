import frappe
from frappe.utils.caching import http_cache, redis_cache


def _get_descendant_item_groups(item_groups: list[str]) -> list[str]:
	if not item_groups:
		return []

	descendant_groups = frappe.db.sql("""
		WITH RECURSIVE category_tree AS (
			SELECT name FROM `tabItem Group` WHERE name IN %(item_groups)s
			UNION ALL
			SELECT child.name FROM `tabItem Group` child
			INNER JOIN category_tree ON child.parent_item_group = category_tree.name
		)
		SELECT DISTINCT name FROM category_tree;
		""", {"item_groups": item_groups}, pluck='name')
	return descendant_groups


@frappe.whitelist(allow_guest=True, methods=['GET'])
@http_cache(public=True, max_age=900, stale_while_revalidate=3600)
@redis_cache(ttl=900, user=None, shared=False)
def get_item_groups():
	""" Returns Item Groups visible in website as a nested tree. """
	ItemGroup = frappe.qb.DocType("Item Group")

	rows = (
		frappe.qb.from_(ItemGroup)
		.select(ItemGroup.name, ItemGroup.parent_item_group, ItemGroup.is_group)
		.where(ItemGroup.show_in_website == 1)
		.orderby(ItemGroup.weightage)
	).run(as_dict=True)

	nodes = {
		row["name"]: {
			"name": row["name"],
			"parent_item_group": row["parent_item_group"],
			"is_group": bool(row["is_group"]),
			"children": [],
		}
		for row in rows
	}

	tree = []
	for row in rows:
		node = nodes[row["name"]]
		parent = nodes.get(row["parent_item_group"])

		if parent:
			parent["children"].append(node)
		else:
			tree.append(node)

	return tree
