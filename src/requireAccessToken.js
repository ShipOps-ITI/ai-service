const requireAccessToken = (req, res, next) => {
  const authorization = req.get("authorization");

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "An access token is required to use the assistant." });
  }

  req.accessToken = authorization.slice("Bearer ".length).trim();
  if (!req.accessToken) {
    return res.status(401).json({ success: false, message: "Invalid access token." });
  }

  next();
};

module.exports = requireAccessToken;
