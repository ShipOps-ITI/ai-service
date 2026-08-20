const axios = require("axios");

const CORE_URL = () => process.env.CORE_SERVICE_URL || "http://localhost:5002/api/v1";
const SHIPMENT_URL = () => process.env.SHIPMENT_SERVICE_URL || "http://localhost:5004/api/shipments";

const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "list_my_shipments",
      description: "List the shipments the signed-in user is authorized to view.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shipment_details",
      description: "Find one authorized shipment by its shipment number or numeric ID.",
      parameters: {
        type: "object",
        properties: { identifier: { type: "string", description: "Shipment number or ID." } },
        required: ["identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ship_location",
      description: "Find the latest known location and AIS update time for an authorized ship by name or ID.",
      parameters: {
        type: "object",
        properties: { identifier: { type: "string", description: "Ship name or numeric ID." } },
        required: ["identifier"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tracking_summary",
      description: "Get an authorized summary of ships with locations, ships marked at sea, and stale AIS updates.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ship_statistics",
      description: "Get the total authorized ship count and the count by operational ship status. Use this for questions asking how many ships are in ShipOps.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fleet_summary",
      description: "List the fleets the signed-in operations user is authorized to view.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "search_ports",
      description: "Search the ShipOps port catalogue by port name or country for an operations user.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Port or country search term." } },
        required: ["query"],
      },
    },
  },
];

const apiGet = async (url, accessToken, params = {}) => {
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params,
      timeout: 5000,
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 401) {
      const authError = new Error("Your session is no longer valid. Please sign in again.");
      authError.status = 401;
      throw authError;
    }

    if (error.response?.status === 403) {
      return { error: "You do not have permission to access this information." };
    }

    return { error: "The requested ShipOps data is temporarily unavailable." };
  }
};

const dataArray = (payload) => (Array.isArray(payload) ? payload : payload?.data ?? []);

const normalize = (value) => String(value ?? "").trim().toLowerCase();
const matches = (record, identifier, fields) => fields.some((field) => normalize(record[field]) === normalize(identifier));

const listShipments = async (accessToken) => {
  const payload = await apiGet(SHIPMENT_URL(), accessToken, { page: 1, limit: 20 });
  if (payload.error) return payload;

  return dataArray(payload).map((shipment) => ({
    id: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    customerName: shipment.customerName,
    origin: shipment.origin,
    destination: shipment.destination,
    status: shipment.status,
    departureDate: shipment.departureDate,
    arrivalDate: shipment.arrivalDate,
  }));
};

const getShipmentDetails = async (identifier, accessToken) => {
  if (/^\d+$/.test(identifier)) {
    const payload = await apiGet(`${SHIPMENT_URL()}/${identifier}`, accessToken);
    return payload.error ? payload : payload.data ?? payload;
  }

  const shipments = await listShipments(accessToken);
  if (shipments.error) return shipments;
  return shipments.find((shipment) => matches(shipment, identifier, ["shipmentNumber"]))
    ?? { error: "No accessible shipment matched that shipment number." };
};

const getShips = async (accessToken) => {
  const payload = await apiGet(`${CORE_URL()}/ships`, accessToken, { page: 1, limit: 100 });
  return payload.error ? payload : dataArray(payload);
};

const getShipLocation = async (identifier, accessToken) => {
  const ships = await getShips(accessToken);
  if (ships.error) return ships;

  const ship = ships.find((item) => matches(item, identifier, ["id", "name"]));
  if (!ship) return { error: "No accessible ship matched that name or ID." };

  return {
    id: ship.id,
    name: ship.name,
    availabilityState: ship.availabilityState,
    latitude: ship.currentLatitude,
    longitude: ship.currentLongitude,
    lastAisUpdateAt: ship.lastAisUpdateAt,
  };
};

const getTrackingSummary = async (accessToken) => {
  const ships = await getShips(accessToken);
  if (ships.error) return ships;

  const now = Date.now();
  const withLocation = ships.filter((ship) => Number.isFinite(ship.currentLatitude) && Number.isFinite(ship.currentLongitude));
  const stale = withLocation.filter((ship) => !ship.lastAisUpdateAt || now - new Date(ship.lastAisUpdateAt).getTime() > 10 * 60 * 1000);

  return {
    vesselsShown: withLocation.length,
    markedAtSea: withLocation.filter((ship) => ship.availabilityState === "AT_SEA").length,
    staleAisUpdates: stale.length,
    staleShips: stale.slice(0, 10).map((ship) => ({ name: ship.name, lastAisUpdateAt: ship.lastAisUpdateAt })),
  };
};

const getShipStatistics = async (accessToken) => {
  const payload = await apiGet(`${CORE_URL()}/ships/statistics`, accessToken);
  if (payload.error) return payload;

  const statistics = payload.data ?? payload;
  return {
    totalShips: statistics.totalShips ?? 0,
    shipsAtSea: statistics.shipsAtSea ?? 0,
    shipsDocked: statistics.shipsDocked ?? 0,
    shipsInMaintenance: statistics.shipsInMaintenance ?? 0,
    shipsByStatus: statistics.shipsByStatus ?? [],
  };
};

const getFleetSummary = async (accessToken) => {
  const payload = await apiGet(`${CORE_URL()}/fleets`, accessToken, { page: 1, limit: 50 });
  if (payload.error) return payload;

  return dataArray(payload).map((fleet) => ({
    id: fleet.id,
    name: fleet.name,
    description: fleet.description,
    companyId: fleet.companyId,
  }));
};

const searchPorts = async (query, accessToken) => {
  const payload = await apiGet(`${CORE_URL()}/ports`, accessToken, { page: 1, limit: 10, search: query });
  if (payload.error) return payload;

  return dataArray(payload).map((port) => ({ id: port.id, name: port.name, country: port.country }));
};

const executeTool = async (name, argumentsJson, accessToken) => {
  let args;
  try {
    args = argumentsJson ? JSON.parse(argumentsJson) : {};
  } catch {
    return { error: "The assistant requested invalid tool arguments." };
  }

  switch (name) {
    case "list_my_shipments": return listShipments(accessToken);
    case "get_shipment_details": return getShipmentDetails(args.identifier, accessToken);
    case "get_ship_location": return getShipLocation(args.identifier, accessToken);
    case "get_tracking_summary": return getTrackingSummary(accessToken);
    case "get_ship_statistics": return getShipStatistics(accessToken);
    case "get_fleet_summary": return getFleetSummary(accessToken);
    case "search_ports": return searchPorts(args.query, accessToken);
    default: return { error: "Unknown ShipOps tool." };
  }
};

module.exports = { toolDefinitions, executeTool };
