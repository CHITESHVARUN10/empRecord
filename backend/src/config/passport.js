import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import { AdminModel } from "../models/Admin.js";
function configurePassport() {
  passport.use(
    new LocalStrategy(
      {
        usernameField: "username",
        passwordField: "password"
      },
      async (username, password, done) => {
        try {
          const admin = await AdminModel.findOne({
            username: username.trim().toLowerCase()
          }).select("+passwordHash").lean();
          if (!admin) {
            return done(null, false, {
              message: "Invalid username or password."
            });
          }
          const passwordMatches = await bcrypt.compare(
            password,
            admin.passwordHash
          );
          if (!passwordMatches) {
            return done(null, false, {
              message: "Invalid username or password."
            });
          }
          return done(null, {
            _id: String(admin._id),
            username: admin.username,
            displayName: admin.displayName
          });
        } catch (error) {
          return done(error);
        }
      }
    )
  );
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });
  passport.deserializeUser(async (id, done) => {
    try {
      const admin = await AdminModel.findById(id).lean();
      if (!admin) return done(null, false);
      return done(null, {
        _id: String(admin._id),
        username: admin.username,
        displayName: admin.displayName
      });
    } catch (error) {
      return done(error);
    }
  });
}
export {
  configurePassport
};
