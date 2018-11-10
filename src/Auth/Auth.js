import auth0 from "auth0-js";

const REDIRECT_ON_LOGIN = "redirect_on_login";

// Stored outside of class since private
let _accessToken = null;
let _scopes = null;

// Private func
function getAuthHeader() {
  return { Authorization: `Bearer ${_accessToken}` };
}

export default class Auth {
  constructor(history) {
    this.history = history;
    this.userProfile = null;
    this.requestedScopes = "openid profile email read:courses";
    this.auth0 = new auth0.WebAuth({
      domain: process.env.REACT_APP_AUTH0_DOMAIN,
      clientID: process.env.REACT_APP_AUTH0_CLIENT_ID,
      redirectUri: process.env.REACT_APP_AUTH0_CALLBACK_URL,
      audience: process.env.REACT_APP_AUTH0_AUDIENCE,
      responseType: "token id_token",
      scope: this.requestedScopes
    });
  }

  login = () => {
    localStorage.setItem(
      REDIRECT_ON_LOGIN,
      JSON.stringify(this.history.location)
    );
    this.auth0.authorize();
  };

  handleAuthentication = () => {
    this.auth0.parseHash((err, authResult) => {
      if (authResult && authResult.accessToken && authResult.idToken) {
        this.setSession(authResult);
        const redirectLocation =
          localStorage.getItem(REDIRECT_ON_LOGIN) === "undefined"
            ? "/"
            : JSON.parse(localStorage.getItem(REDIRECT_ON_LOGIN));
        this.history.push(redirectLocation);
      } else if (err) {
        this.history.push("/");
        alert(`Error: ${err.error}. Check the console for further details.`);
        console.log(err);
      }
      localStorage.removeItem(REDIRECT_ON_LOGIN);
    });
  };

  setSession = authResult => {
    console.log(authResult);
    // set the time that the access token will expire
    const expiresAt = JSON.stringify(
      authResult.expiresIn * 1000 + new Date().getTime()
    );

    // If there is a value on the `scope` param from the authResult,
    // use it to set scopes in the session for the user. Otherwise
    // use the scopes as requested. If no scopes were requested,
    // set it to nothing
    const scopes = authResult.scope || this.requestedScopes || "";

    _accessToken = authResult.accessToken;
    _scopes = scopes;
    this.scheduleTokenRenewal();

    localStorage.setItem("expires_at", expiresAt);
    localStorage.setItem("checkSession", true);
  };

  isAuthenticated() {
    const expiresAt = JSON.parse(localStorage.getItem("expires_at"));
    return new Date().getTime() < expiresAt;
  }

  logout = () => {
    localStorage.removeItem("expires_at");
    localStorage.removeItem("checkSession");

    // Load homepage. This will reload the app which will clear all vars.
    window.location.replace("http://localhost:3000");

    // Or, optionally, can kill the session at Auth0
    // But may not be desirable if you're using SSO
    // since doing so would log user out of all apps.
    // this.auth0.logout({
    //   clientID: process.env.REACT_APP_AUTH0_CLIENT_ID,
    //   returnTo: "http://localhost:3000"
    // });
  };

  getProfile = cb => {
    if (this.userProfile) return cb(this.userProfile);
    if (!_accessToken) return this.login();
    this.auth0.client.userInfo(_accessToken, (err, profile) => {
      if (profile) this.userProfile = profile;
      cb(profile, err);
    });
  };

  userHasScopes(scopes) {
    const grantedScopes = (_scopes || "").split(" ");
    return scopes.every(scope => grantedScopes.includes(scope));
  }

  renewToken(cb) {
    // The first parameter to checkSession allows us to specify the audience and scope.
    // It uses the settings from when we instantiated this Auth0 WebAuth object
    // if we omit these properties.
    this.auth0.checkSession({}, (err, result) => {
      if (err) {
        console.log(`Error: ${err.error} - ${err.error_description}.`);
      } else {
        this.setSession(result);
      }
      if (cb) cb(result);
    });
  }

  scheduleTokenRenewal() {
    const expiresAt = JSON.parse(localStorage.getItem("expires_at"));
    const delay = expiresAt - Date.now();
    // Delay in milliseconds before requesting renewal.
    // Will be 7200000 (120 minutes) immediately after login
    // since Auth0's default token expiration is 2 hours.
    if (delay > 0) setTimeout(() => this.renewToken(), delay);
  }

  // ----------------
  // API Calls
  // These calls are composed here so we can keep the access token private to this file
  // This protects from XSS since the access token isn't accessible outside this file

  getPrivate() {
    return fetch("/private", {
      headers: getAuthHeader()
    });
  }

  getCourse() {
    return fetch("/course", {
      headers: getAuthHeader()
    });
  }

  deleteCourse(courseId) {
    return fetch(`/course/${courseId}`, {
      method: "DELETE",
      headers: getAuthHeader()
    });
  }
}
