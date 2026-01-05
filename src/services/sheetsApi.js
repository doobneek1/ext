import { fetchAuthSession } from "aws-amplify/auth";

export const LOCATION_API_BASE = "https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/locations";
export const PHONE_API_BASE = "https://w6pkliozjh.execute-api.us-east-1.amazonaws.com/prod/phones";
export const NOTE_API = "https://locationnote1-iygwucy2fa-uc.a.run.app";

const getAuthTokens = async () => {
  try {
    const { tokens } = await fetchAuthSession();
    return {
      idToken: tokens?.idToken?.toString() || null,
      accessToken: tokens?.accessToken?.toString() || null
    };
  } catch (error) {
    if (error?.name === "NotAuthorizedException" || error?.name === "UserUnAuthenticatedException") {
      throw new Error("You must be signed in to use Sheets.");
    }
    throw error;
  }
};

const buildAuthVariants = (token, preferRaw) => {
  const raw = { Authorization: token };
  const bearer = { Authorization: `Bearer ${token}` };
  return preferRaw ? [raw, bearer] : [bearer, raw];
};

const readResponseBody = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
};

const authenticatedFetch = async (url, options = {}) => {
  const { preferRawToken = false, headers = {}, body, method = "GET", ...rest } = options;
  const { idToken, accessToken } = await getAuthTokens();
  const tokens = [idToken, accessToken].filter(Boolean);

  if (!tokens.length) {
    throw new Error("No Cognito session token available.");
  }

  let lastAuthError = null;

  for (const token of tokens) {
    const variants = buildAuthVariants(token, preferRawToken);
    for (const variant of variants) {
      const response = await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...headers,
          ...variant
        },
        body: body ? JSON.stringify(body) : undefined,
        credentials: "include",
        ...rest
      });

      if (response.ok) {
        return readResponseBody(response);
      }

      if (response.status === 401 || response.status === 403) {
        lastAuthError = new Error("Not authorized to access Sheets APIs.");
        continue;
      }

      const errorBody = await readResponseBody(response);
      throw new Error(`Sheets API error (${response.status}): ${errorBody || "Unknown error"}`);
    }
  }

  throw lastAuthError || new Error("Sheets API request failed.");
};

export const fetchLocationsByRadius = async ({ latitude, longitude, radius }) => {
  const url = new URL(LOCATION_API_BASE);
  url.searchParams.set("latitude", latitude);
  url.searchParams.set("longitude", longitude);
  url.searchParams.set("radius", radius);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    mode: "cors"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to load locations (${response.status}): ${text}`);
  }

  return response.json();
};

export const patchLocation = async (locationId, payload) => {
  if (!locationId) {
    throw new Error("Location id is required.");
  }
  const url = `${LOCATION_API_BASE}/${locationId}`;
  return authenticatedFetch(url, {
    method: "PATCH",
    body: payload,
    preferRawToken: true
  });
};

export const patchPhone = async (phoneId, payload) => {
  if (!phoneId) {
    throw new Error("Phone id is required.");
  }
  const url = `${PHONE_API_BASE}/${phoneId}`;
  return authenticatedFetch(url, {
    method: "PATCH",
    body: payload,
    preferRawToken: true
  });
};

export const postLocationNote = async ({ uuid, userName, date, note }) => {
  if (!uuid) {
    throw new Error("Location uuid is required.");
  }

  return authenticatedFetch(NOTE_API, {
    method: "POST",
    body: {
      uuid,
      userName,
      date,
      note
    },
    preferRawToken: false
  });
};
