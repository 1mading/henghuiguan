const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(user) {
  const payload = {
    sub: user.id,
    name: user.name,
    role: user.role,
    dept: user.dept,
    dingTalkUserId: user.dingTalkUserId || '',
  };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
  const decoded = jwt.decode(token);
  return {
    token,
    expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
  };
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

function authResponse(user) {
  const { token, expiresAt } = signToken(user);
  return {
    success: true,
    user: sanitizeUser(user),
    token,
    refreshToken: token,
    expiresAt,
    dingTalkUserId: user.dingTalkUserId || '',
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  const { data_json, ...rest } = user;
  return rest;
}

module.exports = { signToken, verifyToken, authResponse, sanitizeUser };
