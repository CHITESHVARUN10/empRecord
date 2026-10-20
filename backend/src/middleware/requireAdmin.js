function requireAdmin(request, response, next) {
  if (request.isAuthenticated && request.isAuthenticated()) {
    next();
    return;
  }
  response.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: "Sign in to continue."
    }
  });
}
export {
  requireAdmin
};
