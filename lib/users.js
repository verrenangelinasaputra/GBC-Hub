const bcrypt = require("bcryptjs");

function loadUsers() {
  const defs = [
    {
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "Admin123!",
      role: "admin",
      display_name: "Admin Kas Kecil",
      email: process.env.ADMIN_EMAIL || "admin@local"
    },
    {
      username: process.env.SUPER_ADMIN_USERNAME || "superadmin",
      password: process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin123!",
      role: "super_admin",
      display_name: "Super Admin",
      email: process.env.SUPER_ADMIN_EMAIL || "superadmin@local"
    },
    {
      username: process.env.OWNER_USERNAME || "owner",
      password: process.env.OWNER_PASSWORD || "Owner123!",
      role: "owner",
      display_name: "Owner",
      email: process.env.OWNER_EMAIL || "owner@local"
    }
  ];

  return defs.map(u => ({
    username: u.username,
    email: u.email,
    role: u.role,
    display_name: u.display_name,
    password_hash: bcrypt.hashSync(u.password, 12)
  }));
}

let users = null;

function getUsers() {
  if (!users) users = loadUsers();
  return users;
}

function findUser(login) {
  const key = String(login || "").trim().toLowerCase();
  return getUsers().find(
    u => u.username.toLowerCase() === key || u.email.toLowerCase() === key
  );
}

function verifyPassword(user, password) {
  return bcrypt.compareSync(String(password || ""), user.password_hash);
}

function publicUser(user) {
  return {
    id: user.username,
    username: user.username,
    email: user.email,
    role: user.role,
    display_name: user.display_name
  };
}

module.exports = { findUser, verifyPassword, publicUser };
