const ROLES = {
  admin: {
    home: "/admin/kas-kecil",
    kasKecil: true,
    kasBesar: false,
    dashboard: false,
    kasKecilRecap: true
  },
  super_admin: {
    home: "/super-admin/kas-besar",
    kasKecil: true,
    kasBesar: true,
    dashboard: false,
    superAdminRecap: true
  },
  owner: {
    home: "/owner/dashboard",
    kasKecil: true,
    kasBesar: true,
    dashboard: true
  }
};

function roleConfig(role) {
  return ROLES[role] || null;
}

function canAccessKasBesar(role) {
  return role === "super_admin" || role === "owner";
}

function canAccessKasKecil(role) {
  return role === "admin" || role === "super_admin" || role === "owner";
}

function canAccessDashboard(role) {
  return role === "owner";
}

function canAccessKasKecilRecap(role) {
  return role === "admin";
}

function canAccessSuperAdminRecap(role) {
  return role === "super_admin";
}

function pathAllowedForRole(pathname, role) {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/owner/dashboard")) return canAccessDashboard(role);
  if (pathname.startsWith("/owner/business-units")) return canAccessDashboard(role);
  if (pathname.includes("/super-admin/recap")) return canAccessSuperAdminRecap(role);
  if (pathname.includes("/kas-kecil/recap")) return canAccessKasKecilRecap(role);
  if (pathname.includes("/kas-besar")) return canAccessKasBesar(role);
  if (pathname.includes("/kas-kecil")) return canAccessKasKecil(role);
  return false;
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Silakan login terlebih dahulu." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Anda tidak memiliki akses ke fitur ini." });
    }
    next();
  };
}

module.exports = {
  ROLES,
  roleConfig,
  canAccessKasBesar,
  canAccessKasKecil,
  canAccessDashboard,
  canAccessKasKecilRecap,
  canAccessSuperAdminRecap,
  pathAllowedForRole,
  requireRoles
};
