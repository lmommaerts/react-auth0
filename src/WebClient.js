import auth0 from 'auth0-js';
import { startsWith, get } from 'lodash';
import Lockr from 'lockr';

function resolveUri(uri) {
  return startsWith(uri, '/') ? `${window.location.origin}${uri}` : uri;
}

export default class Auth0Client {
  constructor(props) {
    this.props = {
      redirectUri: '/authorize',
      responseType: 'token id_token',
      scope: 'openid',
      logoutRedirectUri: '/login',
      storageKey: 'auth',
      ...props,
    };

    const {
      domain, clientID, redirectUri, responseType, scope,
    } = this.props;

    this.client = new auth0.WebAuth({
      domain,
      clientID,
      redirectUri: resolveUri(redirectUri),
      responseType,
      scope,
    });
  }

  isAuthenticated = () => {
    const currentAuth = Lockr.get(this.props.storageKey);
    return new Date().getTime() < get(currentAuth, 'expiresAt');
  };

  setSession = (authResult) => {
    const expiresAt = authResult.expiresIn * 1000 + new Date().getTime();

    Lockr.set(this.props.storageKey, {
      ...authResult,
      expiresAt,
    });
  };

  login = (props) => {
    this.client.authorize(props);
  };

  logout = (props) => {
    Lockr.rm(this.props.storageKey);
    this.client.logout({
      returnTo: resolveUri(this.props.logoutRedirectUri),
      clientID: this.props.clientID,
      ...props,
    });
  };

  authenticate = () => new Promise((resolve, reject) => {
    if (this.isAuthenticated()) return resolve(Lockr.get(this.props.storageKey));
    return this.client.parseHash((err, authResult) => {
      if (authResult && authResult.accessToken && authResult.idToken) {
        this.setSession(authResult);
        resolve(authResult);
      } else {
        reject(err || 'failed to authenticate');
      }
    });
  });

  renewSession = () => new Promise((resolve, reject) => {
    const authSession = Lockr.get(this.props.storageKey);
    if (!authSession) return resolve(); // We resolve if a renewable session does not exist
    if (this.isAuthenticated()) return resolve(authSession);
    return this.client.checkSession({}, (err, authResult) => {
      if (authResult && authResult.accessToken && authResult.idToken) {
        this.setSession(authResult);
        resolve(authResult);
      } else {
        this.logout();
        reject(err || 'failed to renew session');
      }
    });
  });
}
