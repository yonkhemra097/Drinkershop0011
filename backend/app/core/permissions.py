"""Permission catalog + default role policy (a starting point, editable by Admin at runtime)."""

CATALOG: dict[str, list[str]] = {
    "dashboard": ["view"],
    "users": ["view", "create", "edit", "deactivate", "delete"],
    "roles": ["view", "create", "edit", "delete", "assign"],
    "permissions": ["view", "grant", "revoke"],
    "branches": ["view", "create", "edit", "access_all"],
    "products": ["view", "create", "edit", "delete", "publish"],
    "categories": ["view", "create", "edit", "delete"],
    "inventory": ["view", "receive", "adjust", "transfer", "approve_adjustment"],
    "warehouses": ["view", "create", "edit", "delete"],
    "suppliers": ["view", "create", "edit", "delete"],
    "purchases": ["view", "create", "edit", "approve", "receive"],
    "orders": ["view", "create", "edit", "cancel", "approve"],
    "payments": ["view", "verify", "refund"],
    "deliveries": ["view", "assign", "update_status", "confirm"],
    "customers": ["view", "create", "edit", "delete"],
    "pos": ["sell", "discount", "void", "refund"],
    "cash_shifts": ["view", "open", "close"],
    "promotions": ["view", "create", "edit", "delete"],
    "loyalty": ["view", "adjust"],
    "returns": ["view", "create", "approve"],
    "production": ["view", "create", "edit"],
    "reports": ["view", "export"],
    "settings": ["view", "edit"],
    "audit_logs": ["view", "export"],
}

ALL_PERMISSIONS: list[str] = [f"{m}.{a}" for m, actions in CATALOG.items() for a in actions]

_MGMT_EXCLUDED = {
    "users.delete", "roles.create", "roles.edit", "roles.delete",
    "permissions.grant", "permissions.revoke", "branches.create", "branches.edit",
    "branches.access_all", "settings.edit", "audit_logs.view", "audit_logs.export",
}

# name -> (description, is_protected, permissions)
# is_protected: only an Admin may assign this role to a user.
DEFAULT_ROLES: dict[str, tuple[str, bool, list[str]]] = {
    "admin": ("System administrator", True, ALL_PERMISSIONS),
    "management": (
        "Business management", True,
        [p for p in ALL_PERMISSIONS if p not in _MGMT_EXCLUDED],
    ),
    "staff": (
        "Daily sales and stock operations", False,
        ["dashboard.view", "products.view", "categories.view", "inventory.view",
         "orders.view", "orders.create", "orders.edit", "customers.view", "customers.create",
         "pos.sell", "cash_shifts.view", "cash_shifts.open", "cash_shifts.close",
         "deliveries.view", "returns.create"],
    ),
    "delivery": (
        "Delivery personnel (own deliveries only)", False,
        ["dashboard.view", "deliveries.view", "deliveries.update_status", "deliveries.confirm"],
    ),
    "supplier": (
        "External supplier (own purchase orders only)", False,
        ["dashboard.view", "purchases.view"],
    ),
    "customer": ("Storefront customer (self-service only)", False, []),
}
