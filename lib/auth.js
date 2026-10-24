const ROLES = {
  admin: {
    home: "/admin/kas-kecil/form",
    kasKecil: true,
    kasBesar: true,
    dashboard: false,
    kasKecilRecap: true,
    userAccess: true
  },
  super_admin: {
    home: "/super-admin/kas-besar/form",
    kasKecil: true,
    kasBesar: true,
    dashboard: false,
    superAdminRecap: true,
    userAccess: true
  },
  owner: {
    home: "/owner/dashboard",
    kasKecil: true,
    kasBesar: true,
    dashboard: true
  },
  member: {
    home: "/member/welcome",
    kasKecil: false,
    kasBesar: false,
    dashboard: false
  }
};

function memberHome(user) {
  const kk = !!user.access_kas_kecil;
  const kb = !!user.access_kas_besar;
  const submitKk = !!user.input_kas_kecil;
  const submitKb = !!user.input_kas_besar;
  if (submitKb) return "/member/kas-besar/form";
  if (submitKk) return "/member/kas-kecil/form";
  if (kb) return "/member/kas-besar/history";
  if (kk) return "/member/kas-kecil/history";
  return "/member/welcome";
}

function permissionsForUser(user) {
  if (!user) return null;
  const base = { ...(ROLES[user.role] || ROLES.member) };
  if (user.role === "admin") {
    base.submitKasKecil = true;
    base.submitKasBesar = false;
  } else if (user.role === "super_admin") {
    base.submitKasKecil = true;
    base.submitKasBesar = true;
  } else if (user.role === "member") {
    base.kasKecil = !!user.access_kas_kecil;
    base.kasBesar = !!user.access_kas_besar;
    base.submitKasKecil = !!user.input_kas_kecil;
    base.submitKasBesar = !!user.input_kas_besar;
    base.home = memberHome(user);
  }
  return base;
}

function roleConfig(role) {
  return ROLES[role] || null;
}

function canAccessKasBesar(user) {
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin" || user.role === "owner") return true;
  if (user.role === "member") return !!user.access_kas_besar;
  return false;
}

function canAccessKasKecil(user) {
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin" || user.role === "owner") return true;
  if (user.role === "member") return !!user.access_kas_kecil;
  return false;
}

function canSubmitKasBesar(user) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  if (user.role === "member") return !!user.input_kas_besar;
  return false;
}

function canSubmitKasKecil(user) {
  if (!user) return false;
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (user.role === "member") return !!user.input_kas_kecil;
  return false;
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

function canAccessUserManagement(role) {
  return role === "admin" || role === "super_admin";
}

function pathAllowedForRole(pathname, user) {
  const role = user?.role;
  if (pathname === "/login" || pathname === "/register" || pathname === "/forgot-password") return true;
  if (pathname.startsWith("/member/welcome")) return role === "member";
  if (pathname.startsWith("/admin/user-access")) return canAccessUserManagement(role);
  if (pathname.startsWith("/owner/dashboard")) return canAccessDashboard(role);
  if (pathname.startsWith("/owner/business-units")) return canAccessDashboard(role);
  if (pathname.includes("/super-admin/recap")) return canAccessSuperAdminRecap(role);
  if (pathname.includes("/kas-kecil/recap")) return canAccessKasKecil(user);
  if (pathname.includes("/kas-kecil/dashboard")) return canAccessKasKecil(user);
  if (pathname.includes("/kas-besar/dashboard")) return canAccessKasBesar(user);
  if (pathname.includes("/kas-kecil/form")) return canAccessKasKecil(user) && canSubmitKasKecil(user);
  if (pathname.includes("/kas-besar/form")) return canAccessKasBesar(user) && canSubmitKasBesar(user);
  if (pathname.includes("/kas-besar/history")) return canAccessKasBesar(user);
  if (pathname.includes("/kas-kecil/history")) return canAccessKasKecil(user);
  if (pathname.includes("/kas-besar")) return canAccessKasBesar(user);
  if (pathname.includes("/kas-kecil")) return canAccessKasKecil(user);
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

function requireKasBesarSubmit(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  if (!canSubmitKasBesar(req.user)) {
    return res.status(403).json({ error: "Anda tidak memiliki akses input Kas Besar." });
  }
  next();
}

function requireKasKecilSubmit(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  if (!canSubmitKasKecil(req.user)) {
    return res.status(403).json({ error: "Anda tidak memiliki akses input Kas Kecil." });
  }
  next();
}

function requireKasBesarRead(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  if (!canAccessKasBesar(req.user)) {
    return res.status(403).json({ error: "Anda tidak memiliki akses ke Kas Besar." });
  }
  next();
}

function requireKasKecilRead(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Silakan login terlebih dahulu." });
  if (!canAccessKasKecil(req.user)) {
    return res.status(403).json({ error: "Anda tidak memiliki akses ke Kas Kecil." });
  }
  next();
}

module.exports = {
  ROLES,
  roleConfig,
  permissionsForUser,
  memberHome,
  canAccessKasBesar,
  canAccessKasKecil,
  canSubmitKasBesar,
  canSubmitKasKecil,
  canAccessDashboard,
  canAccessKasKecilRecap,
  canAccessSuperAdminRecap,
  canAccessUserManagement,
  pathAllowedForRole,
  requireRoles,
  requireKasBesarSubmit,
  requireKasKecilSubmit,
  requireKasBesarRead,
  requireKasKecilRead
};
