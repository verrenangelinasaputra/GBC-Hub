const {
  ENTITIES,
  SUMBER_DANA_BANK,
  SUMBER_DANA_KAS_KECIL,
  formOptionsForKind
} = require("../config/formDefinitions");

const LIST_SEP = "|";

function parseAccessList(raw) {
  if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean);
  return String(raw ?? "")
    .split(LIST_SEP)
    .map(s => s.trim())
    .filter(Boolean);
}

function serializeAccessList(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.map(s => String(s).trim()).filter(Boolean).join(LIST_SEP);
}

function isUnrestrictedRole(user) {
  const role = user?.role;
  return role === "admin" || role === "super_admin" || role === "owner";
}

function masterSumberDanaForKind(kind) {
  return kind === "kas_besar" ? SUMBER_DANA_BANK : SUMBER_DANA_KAS_KECIL;
}

function memberEntities(user, kind) {
  if (isUnrestrictedRole(user)) return [...ENTITIES];
  const key = kind === "kas_besar" ? "entities_kas_besar" : "entities_kas_kecil";
  return parseAccessList(user[key]);
}

function memberSumberDana(user, kind) {
  if (isUnrestrictedRole(user)) return [...masterSumberDanaForKind(kind)];
  const key = kind === "kas_besar" ? "sumber_dana_kas_besar" : "sumber_dana_kas_kecil";
  return parseAccessList(user[key]);
}

/** Lihat History/Dashboard: wajib centang modul + minimal 1 entitas. */
function memberHasViewScope(user, kind) {
  if (isUnrestrictedRole(user)) return true;
  const access = kind === "kas_besar" ? !!user.access_kas_besar : !!user.access_kas_kecil;
  if (!access) return false;
  return memberEntities(user, kind).length > 0;
}

function memberCanSubmitKind(user, kind) {
  if (isUnrestrictedRole(user)) {
    if (user.role === "admin" || user.role === "super_admin") return true;
    return false;
  }
  const input = kind === "kas_besar" ? !!user.input_kas_besar : !!user.input_kas_kecil;
  if (!input) return false;
  return memberEntities(user, kind).length > 0 && memberSumberDana(user, kind).length > 0;
}

/** Revisi baris transaksi: admin/superadmin, atau flag edit_kas_* + minimal 1 entitas modul itu. */
function memberCanEditKind(user, kind) {
  if (user?.role === "admin" || user?.role === "super_admin") return true;
  const edit = kind === "kas_besar" ? !!user.edit_kas_besar : !!user.edit_kas_kecil;
  if (!edit) return false;
  return memberEntities(user, kind).length > 0;
}

function validateMemberScopeForEdit(user, kind, payload) {
  if (user?.role === "admin" || user?.role === "super_admin") return "";
  if (!memberCanEditKind(user, kind)) {
    return "Anda tidak memiliki akses revisi halaman ini.";
  }
  const ent = String(payload.entitas || "").trim();
  const sd = String(payload.sumberDana || "").trim();
  if (!memberEntities(user, kind).includes(ent)) {
    return "Entitas tidak diizinkan untuk akun Anda.";
  }
  if (!memberSumberDana(user, kind).includes(sd)) {
    return kind === "kas_besar"
      ? "Sumber Dana Bank tidak diizinkan untuk akun Anda."
      : "Sumber Dana Kas Kecil tidak diizinkan untuk akun Anda.";
  }
  return "";
}

function filterFormOptionsForUser(user, kind) {
  const base = formOptionsForKind(kind);
  if (isUnrestrictedRole(user)) return base;
  return {
    ...base,
    entities: memberEntities(user, kind),
    sumberDana: memberSumberDana(user, kind)
  };
}

function validateMemberScopeForSubmit(user, kind, payload) {
  if (isUnrestrictedRole(user)) return "";
  if (!memberCanSubmitKind(user, kind)) {
    return "Anda tidak memiliki akses input halaman ini.";
  }
  const ent = String(payload.entitas || "").trim();
  const sd = String(payload.sumberDana || "").trim();
  if (!memberEntities(user, kind).includes(ent)) {
    return "Entitas tidak diizinkan untuk akun Anda.";
  }
  if (!memberSumberDana(user, kind).includes(sd)) {
    return kind === "kas_besar"
      ? "Sumber Dana Bank tidak diizinkan untuk akun Anda."
      : "Sumber Dana Kas Kecil tidak diizinkan untuk akun Anda.";
  }
  return "";
}

function pickAllowedFromMaster(selected, master) {
  const set = new Set(master);
  const out = [];
  for (const item of parseAccessList(selected)) {
    if (set.has(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

function validateMemberAccessPatch(patch) {
  const access_kk = !!patch.access_kas_kecil;
  const access_kb = !!patch.access_kas_besar;
  const input_kk = !!patch.input_kas_kecil;
  const input_kb = !!patch.input_kas_besar;
  const edit_kk = !!patch.edit_kas_kecil;
  const edit_kb = !!patch.edit_kas_besar;

  const entities_kk = pickAllowedFromMaster(patch.entities_kas_kecil, ENTITIES);
  const entities_kb = pickAllowedFromMaster(patch.entities_kas_besar, ENTITIES);
  const sumber_kk = pickAllowedFromMaster(patch.sumber_dana_kas_kecil, SUMBER_DANA_KAS_KECIL);
  const sumber_kb = pickAllowedFromMaster(patch.sumber_dana_kas_besar, SUMBER_DANA_BANK);

  if (access_kk && !entities_kk.length) {
    return { error: "Kas Kecil (Lihat): pilih minimal 1 entitas." };
  }
  if (access_kb && !entities_kb.length) {
    return { error: "Bank (Lihat): pilih minimal 1 entitas." };
  }
  if (input_kk) {
    if (!entities_kk.length) {
      return { error: "Kas Kecil (Isi form): pilih minimal 1 entitas." };
    }
    if (!sumber_kk.length) {
      return { error: "Kas Kecil (Isi form): pilih minimal 1 sumber dana." };
    }
  }
  if (input_kb) {
    if (!entities_kb.length) {
      return { error: "Bank (Isi form): pilih minimal 1 entitas." };
    }
    if (!sumber_kb.length) {
      return { error: "Bank (Isi form): pilih minimal 1 sumber dana." };
    }
  }
  if (edit_kk) {
    if (!entities_kk.length) return { error: "Kas Kecil (Revisi): pilih minimal 1 entitas." };
    if (!sumber_kk.length) return { error: "Kas Kecil (Revisi): pilih minimal 1 sumber dana." };
  }
  if (edit_kb) {
    if (!entities_kb.length) return { error: "Bank (Revisi): pilih minimal 1 entitas." };
    if (!sumber_kb.length) return { error: "Bank (Revisi): pilih minimal 1 sumber dana." };
  }

  return {
    entities_kas_kecil: entities_kk,
    sumber_dana_kas_kecil: sumber_kk,
    entities_kas_besar: entities_kb,
    sumber_dana_kas_besar: sumber_kb
  };
}

function accessCatalogForAdmin() {
  return {
    entities: ENTITIES,
    sumber_dana_kas_kecil: SUMBER_DANA_KAS_KECIL,
    sumber_dana_kas_besar: SUMBER_DANA_BANK
  };
}

module.exports = {
  LIST_SEP,
  parseAccessList,
  serializeAccessList,
  memberEntities,
  memberSumberDana,
  memberHasViewScope,
  memberCanSubmitKind,
  memberCanEditKind,
  filterFormOptionsForUser,
  validateMemberScopeForSubmit,
  validateMemberScopeForEdit,
  validateMemberAccessPatch,
  accessCatalogForAdmin,
  isUnrestrictedRole
};
