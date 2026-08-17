const axios = require("axios");

const MAX_RECORDS_PER_RESOURCE = 50;

const getResource = async (name, url, accessToken) => {
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { page: 1, limit: MAX_RECORDS_PER_RESOURCE },
      timeout: 5000,
    });
    const payload = response.data;
    return [name, Array.isArray(payload) ? payload : payload.data ?? []];
  } catch (error) {
    // Do not send a request to the model when the supplied token is invalid.
    // All protected ShipOps services use the same access token.
    if (error.response?.status === 401) {
      const authError = new Error("Your session is no longer valid. Please sign in again.");
      authError.status = 401;
      throw authError;
    }

    // A user may not have permission for every resource. Do not reveal the
    // service error or fail the whole conversation because of that.
    return [name, []];
  }
};

const getDataContext = async (accessToken) => {
  const shipmentUrl = process.env.SHIPMENT_SERVICE_URL || "http://localhost:5004/api/shipments";
  const coreUrl = process.env.CORE_SERVICE_URL || "http://localhost:5002/api/v1";

  const resources = await Promise.all([
    getResource("shipments", shipmentUrl, accessToken),
    getResource("ships", `${coreUrl}/ships`, accessToken),
    getResource("fleets", `${coreUrl}/fleets`, accessToken),
    getResource("ports", `${coreUrl}/ports`, accessToken),
    getResource("companies", `${coreUrl}/companies`, accessToken),
  ]);

  return Object.fromEntries(resources);
};

module.exports = { getDataContext };
