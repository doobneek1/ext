import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { fetchAuthSession } from "aws-amplify/auth";
import HeadCells from "./components/EntryCells/HeadCells.jsx";
import { getExactColumnWidth } from "./utils/columnWidthHelpers.js";
import PhoneNumberField from "./components/job/PhoneNumberField.jsx";
import {
  fetchLocationsByRadius,
  patchLocation,
  patchPhone,
  postLocationNote
} from "./services/sheetsApi.js";
import { getCognitoUserInfo } from "./creds.js";
import withStreetlivesAuth from "./streetlivesAuth/withStreetlivesAuth.jsx";
import { useAuthState } from "./contexts/AppStateProvider.js";
import { db, ref as firebaseRef, get, set } from "./firebase.js";
const LOCATION_QUERY = {
  latitude: 40.697488,
  longitude: -73.979681,
  radius: 34000
};
const NOTES_BASE_URL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REVALIDATED_SENTINEL = "revalidated123435355342";
const COLLAPSED_COLUMNS_KEY = "sheets-collapsed-columns";
const buildCacheKey = () => {
  const lat = String(LOCATION_QUERY.latitude).replace(/[^0-9-]/g, "_");
  const lng = String(LOCATION_QUERY.longitude).replace(/[^0-9-]/g, "_");
  return `sheets_${lat}_${lng}_${LOCATION_QUERY.radius}`;
};
const normalizeUrl = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};
const normalizeNoteText = (raw) => {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeNoteText(parsed?.note || parsed?.summary || parsed?.text || trimmed);
      } catch (_error) {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof raw === "object") {
    return normalizeNoteText(raw?.note || raw?.summary || raw?.text || JSON.stringify(raw));
  }
  return String(raw).trim();
};
const parseNoteTimestamp = (dateKey, noteValue) => {
  if (noteValue && typeof noteValue === "object" && noteValue.date) {
    const parsed = Date.parse(noteValue.date);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const parsed = Date.parse(dateKey);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const numeric = Number(dateKey);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(dateKey);
  if (!Number.isNaN(parsed)) return parsed;
  return null;
};
const formatNoteDateLabel = (dateKey, timestamp) => {
  if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  if (timestamp) return new Date(timestamp).toISOString().slice(0, 10);
  return dateKey || "";
};
const parseNotesPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return {
      notes: [],
      latestNote: "",
      latestUser: "",
      latestDate: null,
      latestDateLabel: ""
    };
  }
  const notes = [];
  Object.entries(payload).forEach(([userKey, entries]) => {
    if (!entries || typeof entries !== "object") return;
    if (userKey.startsWith("_") || userKey === "stats" || userKey === "invocations") return;
    Object.entries(entries).forEach(([dateKey, noteValue]) => {
      const noteText = normalizeNoteText(noteValue);
      if (!noteText) return;
      const resolvedUser = noteValue?.userName ? String(noteValue.userName) : userKey;
      const timestamp = parseNoteTimestamp(dateKey, noteValue);
      notes.push({
        user: resolvedUser,
        note: noteText,
        date: timestamp,
        dateLabel: formatNoteDateLabel(dateKey, timestamp)
      });
    });
  });
  notes.sort((a, b) => (b.date || 0) - (a.date || 0));
  const latest = notes[0] || null;
  return {
    notes,
    latestNote: latest?.note || "",
    latestUser: latest?.user || "",
    latestDate: latest?.date || null,
    latestDateLabel: latest?.dateLabel || ""
  };
};
const isRevalidatedNote = (noteText) => {
  if (!noteText) return false;
  const normalized = String(noteText).trim().toLowerCase();
  if (normalized === REVALIDATED_SENTINEL) return true;
  const cleaned = normalized.replace(/revalidated\d+/g, "revalidated");
  if (!/\brevalidated\b/.test(cleaned)) return false;
  if (/\bdid(?:n'?t| not)\s+revalidat/.test(cleaned)) return false;
  if (/\bnot\s+revalidat/.test(cleaned)) return false;
  return true;
};
const normalizePhoneNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
};
const getLastValidatedTimestamp = (location) => {
  const raw = location?.last_validated_at || location?.lastValidatedAt || location?.lastValidated;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
};
const buildAddressPayload = (address, address1) => {
  const entry = {
    id: address?.id || undefined,
    location_id: address?.location_id || undefined,
    address_1: address1,
    address_2: address?.address_2 || undefined,
    city: address?.city || undefined,
    state_province: address?.state_province || undefined,
    postal_code: address?.postal_code || undefined,
    country: address?.country || undefined,
    region: address?.region || undefined
  };
  return {
    physical_addresses: [entry]
  };
};
const formatCacheTimestamp = (timestamp) => {
  if (!timestamp) return "unknown";
  try {
    return new Date(timestamp).toLocaleString();
  } catch (_error) {
    return "unknown";
  }
};
const COLUMN_ORDER = [
  "organization",
  "location",
  "services",
  "notes",
  "claim",
  "revalidated",
  "address",
  "website",
  "phones",
  "email",
  "gogetta"
];
const COLUMN_LABELS = {
  organization: "Organization",
  location: "Location",
  services: "Services",
  notes: "Notes",
  claim: "Claim",
  revalidated: "Revalidated",
  address: "Address",
  website: "Website",
  phones: "Phones",
  email: "Email",
  gogetta: "Gogetta"
};
const COLUMN_LABELS_SHORT = {
  organization: "Org",
  location: "Loc",
  services: "Svcs",
  notes: "Notes",
  claim: "Claim",
  revalidated: "Rev",
  address: "Addr",
  website: "Web",
  phones: "Phone",
  email: "Email",
  gogetta: "Go"
};
const DEFAULT_ROW_HEIGHT = 120;
const MOBILE_ROW_HEIGHT = 160;
const DEFAULT_COLUMN_WIDTHS = {
  organization: "12%",
  location: "10%",
  services: "14%",
  notes: "14%",
  claim: "7%",
  revalidated: "5%",
  address: "16%",
  website: "6%",
  phones: "8%",
  email: "6%",
  gogetta: "2%"
};
const MIN_COLUMN_WIDTH = 60;
const SheetsCell = ({
  columnKey,
  collapsedColumns,
  columnOrder,
  tableContainerRef,
  isMobile,
  children,
  collapsedContent = null
}) => {
  const isCollapsed = Boolean(collapsedColumns?.[columnKey]);
  const width = getExactColumnWidth({
    isCollapsed,
    mode: columnKey,
    isMobile,
    DEFAULT_COLUMN_WIDTHS,
    columnOrder,
    collapsedColumns,
    tableContainerRef
  });
  return (
    <TableCell
      sx={(theme) => ({
        flexBasis: width,
        width,
        minWidth: isCollapsed ? "10px" : "auto",
        maxWidth: isCollapsed ? "10px" : "none",
        display: "flex",
        alignItems: isCollapsed ? "center" : "stretch",
        justifyContent: isCollapsed ? "center" : "flex-start",
        padding: isCollapsed ? 0 : "4px 6px",
        overflow: "hidden",
        boxSizing: "border-box",
        flexShrink: 0,
        flexGrow: 0,
        height: "100%",
        ...(isCollapsed && {
          backgroundColor: "transparent",
          borderLeft: `1px solid ${theme.palette.divider}`
        }),
        "@media (max-width: 600px)": {
          width: `${width} !important`,
          minWidth: `${width} !important`,
          maxWidth: `${width} !important`,
          flexBasis: `${width} !important`
        }
      })}
    >
      {isCollapsed ? collapsedContent : children}
    </TableCell>
  );
};
const OverflowCell = ({ row, columnKey, onOpenDetail, children }) => {
  const contentRef = React.useRef(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);
  const measureOverflow = React.useCallback(() => {
    const node = contentRef.current;
    if (!node) return;
    const next =
      node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
    setIsOverflowing(next);
  }, []);
  React.useEffect(() => {
    measureOverflow();
  }, [measureOverflow, children]);
  React.useEffect(() => {
    const node = contentRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const resizeObserver = new ResizeObserver(() => measureOverflow());
    resizeObserver.observe(node);
    return () => {
      resizeObserver.disconnect();
    };
  }, [measureOverflow]);
  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <Box
        ref={contentRef}
        sx={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          pr: isOverflowing ? 3 : 0,
          pb: isOverflowing ? 3 : 0
        }}
      >
        {children}
      </Box>
      {isOverflowing ? (
        <Tooltip title="Open full record" arrow>
          <IconButton
            size="small"
            onClick={() => onOpenDetail(row, columnKey)}
            aria-label={`Open ${COLUMN_LABELS[columnKey] || columnKey} details`}
            sx={{
              position: "absolute",
              right: 4,
              bottom: 4,
              backgroundColor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              boxShadow: 1,
              "&:hover": {
                backgroundColor: "background.paper"
              }
            }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
};
const SheetsApp = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const rowHeight = isMobile ? MOBILE_ROW_HEIGHT : DEFAULT_ROW_HEIGHT;
  const { user: firebaseUser } = useAuthState();
  const cacheKey = React.useMemo(() => buildCacheKey(), []);
  const localCacheKey = React.useMemo(() => `sheetsCache:${cacheKey}`, [cacheKey]);
  const [locations, setLocations] = React.useState([]);
  const [notesById, setNotesById] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [notesLoading, setNotesLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [cacheInfo, setCacheInfo] = React.useState(null);
  const [snackbar, setSnackbar] = React.useState({ open: false, message: "", severity: "success" });
  const [collapsedColumns, setCollapsedColumns] = React.useState(() => {
    const defaults = {};
    COLUMN_ORDER.forEach((key) => {
      defaults[key] = false;
    });
    return defaults;
  });
  const [serviceModal, setServiceModal] = React.useState({
    open: false,
    services: [],
    focusId: null,
    locationName: ""
  });
  const [detailModal, setDetailModal] = React.useState({
    open: false,
    row: null,
    focusKey: null
  });
  const [noteModal, setNoteModal] = React.useState({
    open: false,
    locationId: null,
    locationName: "",
    value: ""
  });
  const [noteSubmitting, setNoteSubmitting] = React.useState(false);
  const [cognitoUsername, setCognitoUsername] = React.useState(null);
  const [addressDrafts, setAddressDrafts] = React.useState({});
  const [phoneDrafts, setPhoneDrafts] = React.useState({});
  const [savingAddressIds, setSavingAddressIds] = React.useState(new Set());
  const [savingPhoneIds, setSavingPhoneIds] = React.useState(new Set());
  const [bottomScrollWidth, setBottomScrollWidth] = React.useState(0);
  const tableContainerRef = React.useRef(null);
  const bottomScrollbarRef = React.useRef(null);
  const detailSectionRefs = React.useRef(new Map());
  const syncLockRef = React.useRef(false);
  const columnWidthsRef = React.useRef(DEFAULT_COLUMN_WIDTHS);
  const addressDefaultsRef = React.useRef({});
  const phoneDefaultsRef = React.useRef({});
  const serviceRefs = React.useRef(new Map());
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_COLUMNS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setCollapsedColumns((prev) => ({ ...prev, ...parsed }));
    } catch (_error) {
      // Ignore storage failures.
    }
  }, []);
  const toggleAndPersistColumn = React.useCallback((columnKey) => {
    setCollapsedColumns((prev) => {
      const next = { ...prev, [columnKey]: !prev[columnKey] };
      try {
        localStorage.setItem(COLLAPSED_COLUMNS_KEY, JSON.stringify(next));
      } catch (_error) {
        // Ignore storage failures.
      }
      return next;
    });
  }, []);
  React.useEffect(() => {
    let active = true;
    const loadCognitoUser = async () => {
      try {
        const session = await fetchAuthSession();
        const idToken = session?.tokens?.idToken?.toString();
        const userInfo = getCognitoUserInfo(idToken);
        const username = userInfo?.username || userInfo?.email || null;
        if (active) setCognitoUsername(username);
      } catch (_error) {
        if (active) setCognitoUsername(null);
      }
    };
    loadCognitoUser();
    return () => {
      active = false;
    };
  }, []);
  const sendTokensToHost = React.useCallback(
    async (requestedNonce, targetWindow, targetOrigin) => {
      const originToUse = targetOrigin || window.location.origin;
      if (!targetWindow) return;
      try {
        const session = await fetchAuthSession();
        const payload = {
          username: cognitoUsername || null,
          accessToken: session?.tokens?.accessToken?.toString() || null,
          idToken: session?.tokens?.idToken?.toString() || null,
          refreshToken: session?.tokens?.refreshToken?.toString() || null,
          nonce: requestedNonce || null
        };
        targetWindow.postMessage({ type: "TOKENS", payload }, originToUse);
      } catch (error) {
        targetWindow.postMessage(
          {
            type: "TOKENS_UNAVAILABLE",
            payload: {
              error: error?.message || "Authentication required",
              nonce: requestedNonce || null
            }
          },
          originToUse
        );
      }
    },
    [cognitoUsername]
  );
  React.useEffect(() => {
    const handleEmbedTokenRequest = (event) => {
      if (!event?.data) return;
      if (event.data?.type !== "REQUEST_TOKENS") return;
      const origin = event.origin || window.location.origin;
      const allowedOrigins = [
        window.location.origin,
        "https://gogetta.nyc",
        "https://www.gogetta.nyc",
        "https://test.gogetta.nyc",
        "http://localhost:3000",
        "http://localhost:3210",
        "https://localhost:3210",
        "https://sheets.localhost:3210"
      ];
      const isAllowedHost = allowedOrigins.includes(origin);
      const isExtensionOrigin =
        origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://");
      if (!isAllowedHost && !isExtensionOrigin) return;
      const targetWindow = event.source || window.parent;
      void sendTokensToHost(event.data?.payload?.nonce, targetWindow, origin);
    };
    window.addEventListener("message", handleEmbedTokenRequest);
    return () => window.removeEventListener("message", handleEmbedTokenRequest);
  }, [sendTokensToHost]);
  const readCache = React.useCallback(async () => {
    if (firebaseUser?.uid) {
      try {
        const snap = await get(firebaseRef(db, `users/${firebaseUser.uid}/meta/sheetsCache/${cacheKey}`));
        if (snap.exists()) {
          return { source: "firebase", ...snap.val() };
        }
      } catch (_error) {
        // Ignore cache read failure.
      }
    }
    try {
      const raw = localStorage.getItem(localCacheKey);
      if (!raw) return null;
      return { source: "local", ...JSON.parse(raw) };
    } catch (_error) {
      return null;
    }
  }, [cacheKey, firebaseUser?.uid, localCacheKey]);
  const writeCache = React.useCallback(async (payload) => {
    const cachePayload = {
      fetchedAt: Date.now(),
      locations: payload
    };
    if (firebaseUser?.uid) {
      try {
        await set(firebaseRef(db, `users/${firebaseUser.uid}/meta/sheetsCache/${cacheKey}`), cachePayload);
        setCacheInfo({ source: "firebase", fetchedAt: cachePayload.fetchedAt });
        return;
      } catch (_error) {
        // Fall through to local cache.
      }
    }
    try {
      localStorage.setItem(localCacheKey, JSON.stringify(cachePayload));
      setCacheInfo({ source: "local", fetchedAt: cachePayload.fetchedAt });
    } catch (_error) {
      // Ignore storage failures.
    }
  }, [cacheKey, firebaseUser?.uid, localCacheKey]);
  const refreshLocations = React.useCallback(async ({ skipLoading = false } = {}) => {
    if (!skipLoading) setLoading(true);
    setRefreshing(true);
    setError(null);
    try {
      const data = await fetchLocationsByRadius(LOCATION_QUERY);
      const list = Array.isArray(data) ? data : [];
      setLocations(list);
      await writeCache(list);
    } catch (err) {
      setError(err?.message || "Failed to load locations.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [writeCache]);
  React.useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      const cached = await readCache();
      if (cached && active) {
        if (Array.isArray(cached.locations)) {
          setLocations(cached.locations);
        }
        if (cached.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          setCacheInfo({ source: cached.source || "cache", fetchedAt: cached.fetchedAt });
          setLoading(false);
        }
      }
      await refreshLocations({ skipLoading: Boolean(cached) });
    };
    bootstrap();
    return () => {
      active = false;
    };
  }, [readCache, refreshLocations]);
  React.useEffect(() => {
    setAddressDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      locations.forEach((loc) => {
        const address = Array.isArray(loc?.PhysicalAddresses) ? loc.PhysicalAddresses[0] : null;
        const address1 = address?.address_1 || "";
        if (next[loc.id] === undefined || next[loc.id] === addressDefaultsRef.current[loc.id]) {
          next[loc.id] = address1;
          changed = true;
        }
        addressDefaultsRef.current[loc.id] = address1;
      });
      return changed ? next : prev;
    });
  }, [locations]);
  React.useEffect(() => {
    setPhoneDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      locations.forEach((loc) => {
        const phones = Array.isArray(loc?.Phones) ? loc.Phones : [];
        phones.forEach((phone) => {
          if (!phone?.id) return;
          const number = phone?.number || "";
          if (next[phone.id] === undefined || next[phone.id] === phoneDefaultsRef.current[phone.id]) {
            next[phone.id] = number;
            changed = true;
          }
          phoneDefaultsRef.current[phone.id] = number;
        });
      });
      return changed ? next : prev;
    });
  }, [locations]);
  const loadNotesForLocation = React.useCallback(async (locationId) => {
    const response = await fetch(`${NOTES_BASE_URL}/${locationId}.json`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Notes fetch failed (${response.status}).`);
    }
    const data = await response.json();
    return parseNotesPayload(data);
  }, []);
  React.useEffect(() => {
    let active = true;
    const loadAllNotes = async () => {
      if (!locations.length) return;
      const missing = locations.filter((loc) => !notesById[loc.id]);
      if (!missing.length) return;
      setNotesLoading(true);
      const nextNotes = {};
      await Promise.all(
        missing.map(async (loc) => {
          try {
            const parsed = await loadNotesForLocation(loc.id);
            nextNotes[loc.id] = parsed;
          } catch (_error) {
            nextNotes[loc.id] = { notes: [], latestNote: "", latestUser: "", latestDate: null };
          }
        })
      );
      if (active && Object.keys(nextNotes).length > 0) {
        setNotesById((prev) => ({ ...prev, ...nextNotes }));
      }
      if (active) setNotesLoading(false);
    };
    loadAllNotes();
    return () => {
      active = false;
    };
  }, [locations, loadNotesForLocation, notesById]);
  React.useEffect(() => {
    if (!serviceModal.open || !serviceModal.focusId) return;
    const node = serviceRefs.current.get(serviceModal.focusId);
    if (node && node.scrollIntoView) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [serviceModal.open, serviceModal.focusId]);
  React.useEffect(() => {
    if (!detailModal.open || !detailModal.focusKey) return;
    const node = detailSectionRefs.current.get(detailModal.focusKey);
    if (node && node.scrollIntoView) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [detailModal.open, detailModal.focusKey]);
  const rows = React.useMemo(() => {
    const mapped = locations.map((loc) => {
      const address = Array.isArray(loc?.PhysicalAddresses) ? loc.PhysicalAddresses[0] : null;
      const notes = notesById[loc.id] || {};
      const lastValidatedTs = getLastValidatedTimestamp(loc);
      return {
        id: loc.id,
        organization: loc?.Organization?.name || "",
        locationName: loc?.name || "",
        services: Array.isArray(loc?.Services) ? loc.Services : [],
        notes,
        address,
        phones: Array.isArray(loc?.Phones) ? loc.Phones : [],
        website: loc?.url || loc?.Organization?.url || "",
        email: loc?.email || loc?.Organization?.email || "",
        lastValidatedTs
      };
    });
    mapped.sort((a, b) => (b.lastValidatedTs || 0) - (a.lastValidatedTs || 0));
    return mapped;
  }, [locations, notesById]);
  const updateBottomScrollWidth = React.useCallback(() => {
    const node = tableContainerRef.current;
    if (!node) return;
    const nextWidth = Math.max(node.scrollWidth, node.clientWidth);
    setBottomScrollWidth(nextWidth);
  }, []);
  React.useEffect(() => {
    updateBottomScrollWidth();
  }, [updateBottomScrollWidth, collapsedColumns, rows.length, isMobile]);
  React.useEffect(() => {
    const tableNode = tableContainerRef.current;
    const bottomNode = bottomScrollbarRef.current;
    if (!tableNode || !bottomNode) return undefined;
    const syncScroll = (source, target) => {
      if (syncLockRef.current) return;
      syncLockRef.current = true;
      target.scrollLeft = source.scrollLeft;
      window.requestAnimationFrame(() => {
        syncLockRef.current = false;
      });
    };
    const syncFromTable = () => syncScroll(tableNode, bottomNode);
    const syncFromBottom = () => syncScroll(bottomNode, tableNode);
    tableNode.addEventListener("scroll", syncFromTable);
    bottomNode.addEventListener("scroll", syncFromBottom);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => updateBottomScrollWidth());
    if (resizeObserver) {
      const tableElement = tableNode.querySelector("table");
      resizeObserver.observe(tableElement || tableNode);
    }
    return () => {
      tableNode.removeEventListener("scroll", syncFromTable);
      bottomNode.removeEventListener("scroll", syncFromBottom);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [updateBottomScrollWidth]);
  const handleSaveAddress = async (row) => {
    const draft = addressDrafts[row.id] ?? "";
    if (!row.address) {
      setSnackbar({ open: true, message: "No address record available.", severity: "error" });
      return;
    }
    setSavingAddressIds((prev) => new Set([...prev, row.id]));
    try {
      const payload = buildAddressPayload(row.address, draft.trim());
      await patchLocation(row.id, payload);
      setLocations((prev) =>
        prev.map((loc) => {
          if (loc.id !== row.id) return loc;
          const updatedAddresses = Array.isArray(loc.PhysicalAddresses) ? [...loc.PhysicalAddresses] : [];
          if (updatedAddresses.length) {
            updatedAddresses[0] = { ...updatedAddresses[0], address_1: draft.trim() };
          }
          return { ...loc, PhysicalAddresses: updatedAddresses };
        })
      );
      addressDefaultsRef.current[row.id] = draft.trim();
      setSnackbar({ open: true, message: "Address updated.", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Failed to update address.", severity: "error" });
    } finally {
      setSavingAddressIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };
  const handleSavePhone = async (locationId, phoneId) => {
    const draft = phoneDrafts[phoneId] ?? "";
    const normalized = normalizePhoneNumber(draft);
    if (!normalized) {
      setSnackbar({ open: true, message: "Enter a phone number before saving.", severity: "warning" });
      return;
    }
    setSavingPhoneIds((prev) => new Set([...prev, phoneId]));
    try {
      await patchPhone(phoneId, { number: normalized });
      setLocations((prev) =>
        prev.map((loc) => {
          if (loc.id !== locationId) return loc;
          const updatedPhones = Array.isArray(loc.Phones) ? [...loc.Phones] : [];
          const idx = updatedPhones.findIndex((phone) => phone.id === phoneId);
          if (idx >= 0) {
            updatedPhones[idx] = { ...updatedPhones[idx], number: normalized };
          }
          return { ...loc, Phones: updatedPhones };
        })
      );
      phoneDefaultsRef.current[phoneId] = normalized;
      setSnackbar({ open: true, message: "Phone updated.", severity: "success" });
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Failed to update phone.", severity: "error" });
    } finally {
      setSavingPhoneIds((prev) => {
        const next = new Set(prev);
        next.delete(phoneId);
        return next;
      });
    }
  };
  const handleOpenNotes = (row) => {
    setNoteModal({ open: true, locationId: row.id, locationName: row.locationName, value: "" });
  };
  const handleSubmitNote = async () => {
    const noteText = noteModal.value.trim();
    if (!noteText) {
      setSnackbar({ open: true, message: "Enter a note before saving.", severity: "warning" });
      return;
    }
    setNoteSubmitting(true);
    try {
      const userName = cognitoUsername || "doobneek";
      const date = String(Date.now());
      await postLocationNote({
        uuid: noteModal.locationId,
        userName,
        date,
        note: noteText
      });
      const refreshed = await loadNotesForLocation(noteModal.locationId);
      setNotesById((prev) => ({ ...prev, [noteModal.locationId]: refreshed }));
      setSnackbar({ open: true, message: "Note saved.", severity: "success" });
      setNoteModal({ open: false, locationId: null, locationName: "", value: "" });
    } catch (err) {
      setSnackbar({ open: true, message: err?.message || "Failed to save note.", severity: "error" });
    } finally {
      setNoteSubmitting(false);
    }
  };
  const handleOpenServiceModal = (row, service) => {
    setServiceModal({
      open: true,
      services: row.services || [],
      focusId: service?.id || null,
      locationName: row.locationName
    });
  };
  const handleOpenDetail = React.useCallback((row, columnKey) => {
    setDetailModal({ open: true, row, focusKey: columnKey });
  }, []);
  const handleCloseDetail = React.useCallback(() => {
    setDetailModal({ open: false, row: null, focusKey: null });
  }, []);
  const renderDetailValue = (row, columnKey) => {
    const notes = row.notes || {};
    const latestNote = notes.latestNote || "";
    const latestUser = notes.latestUser || "";
    const addressSuffix = [
      row.address?.city,
      row.address?.state_province,
      row.address?.postal_code
    ]
      .filter(Boolean)
      .join(", ");
    switch (columnKey) {
      case "organization":
        return <Typography variant="body2">{row.organization || "--"}</Typography>;
      case "location":
        return <Typography variant="body2">{row.locationName || "--"}</Typography>;
      case "services":
        return row.services.length ? (
          <Stack spacing={1}>
            {row.services.map((service, index) => (
              <Box key={service?.id || `detail-service-${index}`}>
                <Typography variant="subtitle2">{service?.name || "Untitled service"}</Typography>
                {service?.description ? (
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {service.description}
                  </Typography>
                ) : null}
                {service?.Taxonomies?.length ? (
                  <Typography variant="caption" color="text.secondary">
                    Taxonomies: {service.Taxonomies.map((tax) => tax?.name).filter(Boolean).join(", ")}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No services
          </Typography>
        );
      case "notes":
        return notes.notes?.length ? (
          <Stack spacing={1}>
            {notes.notes.map((entry, index) => (
              <Box key={`detail-note-${row.id}-${index}`}>
                <Typography variant="caption" sx={{ fontWeight: index === 0 ? 600 : 400 }}>
                  {entry.user || "unknown"} {entry.dateLabel ? `- ${entry.dateLabel}` : ""}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {entry.note}
                </Typography>
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No notes yet
          </Typography>
        );
      case "claim":
        return <Typography variant="body2">{latestUser || "--"}</Typography>;
      case "revalidated":
        return <Typography variant="body2">{isRevalidatedNote(latestNote) ? "Yes" : "No"}</Typography>;
      case "address": {
        const addressParts = [row.address?.address_1, row.address?.address_2, addressSuffix].filter(Boolean);
        return (
          <Typography variant="body2">{addressParts.length ? addressParts.join(", ") : "--"}</Typography>
        );
      }
      case "website":
        return row.website ? (
          <Link href={normalizeUrl(row.website)} target="_blank" rel="noreferrer">
            {row.website}
          </Link>
        ) : (
          <Typography variant="body2" color="text.secondary">
            --
          </Typography>
        );
      case "phones":
        return row.phones.length ? (
          <Stack spacing={0.5}>
            {row.phones.map((phone, index) => (
              <Typography key={phone?.id || `detail-phone-${index}`} variant="body2">
                {phone?.number || "--"}
              </Typography>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            --
          </Typography>
        );
      case "email":
        return row.email ? (
          <Link href={`mailto:${row.email}`}>{row.email}</Link>
        ) : (
          <Typography variant="body2" color="text.secondary">
            --
          </Typography>
        );
      case "gogetta":
        return (
          <Link href={`https://gogetta.nyc/team/location/${row.id}`} target="_blank" rel="noreferrer">
            Open in Gogetta
          </Link>
        );
      default:
        return <Typography variant="body2">--</Typography>;
    }
  };
  const cacheLabel = cacheInfo?.fetchedAt ? formatCacheTimestamp(cacheInfo.fetchedAt) : null;
  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 3 },
        pt: { xs: 2, md: 3 },
        pb: 0,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxSizing: "border-box"
      }}
    >
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1} alignItems={{ xs: "flex-start", md: "center" }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              Sheets
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Cached location table with inline edits, service details, and notes.
            </Typography>
            {cacheLabel && (
              <Typography variant="caption" color="text.secondary">
                Cache: {cacheInfo?.source || "cache"} at {cacheLabel}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              startIcon={refreshing ? <CircularProgress size={14} /> : <RefreshIcon />}
              onClick={() => refreshLocations({ skipLoading: true })}
              disabled={refreshing}
            >
              Refresh
            </Button>
            {notesLoading && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={16} />
                <Typography variant="caption" color="text.secondary">
                  Loading notes
                </Typography>
              </Stack>
            )}
          </Stack>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <Paper elevation={2} sx={{ overflow: "hidden", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <TableContainer
            ref={tableContainerRef}
            sx={{ flex: 1, minHeight: 0, overflow: "auto" }}
          >
            <Table stickyHeader component="table" sx={{ minWidth: 1200 }}>
              <TableHead component="thead" sx={{ display: "block" }}>
                <TableRow component="tr" sx={{ display: "flex" }}>
                  {COLUMN_ORDER.map((key) => {
                    return (
                      <HeadCells
                        key={key}
                        messageCollapsed={COLUMN_LABELS_SHORT[key] || COLUMN_LABELS[key] || key}
                        messageExpanded={COLUMN_LABELS[key] || key}
                        type={key}
                        columnWidthsRef={columnWidthsRef}
                        DEFAULT_COLUMN_WIDTHS={DEFAULT_COLUMN_WIDTHS}
                        collapsedColumns={collapsedColumns}
                        toggleAndPersistColumn={toggleAndPersistColumn}
                        MIN_COLUMN_WIDTH={MIN_COLUMN_WIDTH}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        effectiveColumnOrder={COLUMN_ORDER}
                        isMobile={isMobile}
                      />
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody component="tbody" sx={{ display: "block" }}>
                {loading && !rows.length ? (
                  <TableRow component="tr" sx={{ display: "flex" }}>
                    <TableCell colSpan={COLUMN_ORDER.length} sx={{ width: "100%" }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CircularProgress size={20} />
                        <Typography>Loading locations...</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : null}
                {rows.map((row) => {
                  const notes = row.notes || {};
                  const latestNote = notes.latestNote || "";
                  const latestUser = notes.latestUser || "";
                  const isRevalidated = isRevalidatedNote(latestNote);
                  const addressSuffix = [
                    row.address?.city,
                    row.address?.state_province,
                    row.address?.postal_code
                  ]
                    .filter(Boolean)
                    .join(", ");
                  const addressDraft = addressDrafts[row.id] ?? "";
                  const addressDirty = addressDraft !== (addressDefaultsRef.current[row.id] || "");
                  const isSavingAddress = savingAddressIds.has(row.id);
                  return (
                    <TableRow
                      component="tr"
                      key={row.id}
                      sx={{
                        display: "flex",
                        alignItems: "stretch",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        height: rowHeight,
                        minHeight: rowHeight,
                        maxHeight: rowHeight
                      }}
                    >
                      <SheetsCell
                        columnKey="organization"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="organization" onOpenDetail={handleOpenDetail}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.organization || "--"}
                          </Typography>
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="location"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="location" onOpenDetail={handleOpenDetail}>
                          <Typography variant="body2">{row.locationName || "--"}</Typography>
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="services"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="services" onOpenDetail={handleOpenDetail}>
                          <Stack spacing={0.5} sx={{ width: "100%", overflow: "hidden" }}>
                            {row.services.length ? (
                              row.services.map((service, index) => (
                                <Button
                                  key={service?.id || `${row.id}-service-${index}`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ justifyContent: "flex-start", textTransform: "none" }}
                                  onClick={() => handleOpenServiceModal(row, service)}
                                >
                                  {service?.name || "Untitled service"}
                                </Button>
                              ))
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                No services
                              </Typography>
                            )}
                            {row.services.length > 3 && (
                              <Typography variant="caption" color="text.secondary">
                                +{row.services.length - 3} more
                              </Typography>
                            )}
                          </Stack>
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="notes"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="notes" onOpenDetail={handleOpenDetail}>
                          <Stack spacing={0.5} sx={{ width: "100%", overflow: "hidden" }}>
                            <Box sx={{ overflow: "hidden" }}>
                              {notes.notes?.length ? (
                                notes.notes.map((entry, index) => (
                                  <Box key={`${row.id}-note-${index}`} sx={{ mb: 0.5 }}>
                                    <Typography variant="caption" sx={{ fontWeight: index === 0 ? 600 : 400 }}>
                                      {entry.user || "unknown"} {entry.dateLabel ? `- ${entry.dateLabel}` : ""}
                                    </Typography>
                                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                                      {entry.note}
                                    </Typography>
                                  </Box>
                                ))
                              ) : (
                                <Typography variant="caption" color="text.secondary">
                                  No notes yet
                                </Typography>
                              )}
                            </Box>
                            <Button
                              size="small"
                              variant="text"
                              startIcon={<NoteAddIcon fontSize="small" />}
                              sx={{ alignSelf: "flex-start", textTransform: "none" }}
                              onClick={() => handleOpenNotes(row)}
                            >
                              Add note
                            </Button>
                          </Stack>
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="claim"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="claim" onOpenDetail={handleOpenDetail}>
                          <Typography variant="body2">{latestUser || "--"}</Typography>
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="revalidated"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="revalidated" onOpenDetail={handleOpenDetail}>
                          <Checkbox checked={isRevalidated} disabled />
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="address"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="address" onOpenDetail={handleOpenDetail}>
                          <Stack spacing={0.5} sx={{ width: "100%", overflow: "hidden" }}>
                            <TextField
                              value={addressDraft}
                              onChange={(event) =>
                                setAddressDrafts((prev) => ({ ...prev, [row.id]: event.target.value }))
                              }
                              size="small"
                              fullWidth
                              placeholder="Address line 1"
                              InputProps={{
                                endAdornment: addressSuffix ? (
                                  <InputAdornment position="end">
                                    <Typography variant="caption" color="text.secondary">
                                      {addressSuffix}
                                    </Typography>
                                  </InputAdornment>
                                ) : null
                              }}
                            />
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={isSavingAddress ? <CircularProgress size={14} /> : <SaveIcon fontSize="small" />}
                              disabled={!addressDirty || isSavingAddress}
                              onClick={() => handleSaveAddress(row)}
                              sx={{ alignSelf: "flex-start", textTransform: "none" }}
                            >
                              Save address
                            </Button>
                          </Stack>
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="website"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="website" onOpenDetail={handleOpenDetail}>
                          {row.website ? (
                            <Link href={normalizeUrl(row.website)} target="_blank" rel="noreferrer">
                              {row.website}
                            </Link>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              --
                            </Typography>
                          )}
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="phones"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="phones" onOpenDetail={handleOpenDetail}>
                          <Stack spacing={1} sx={{ width: "100%", overflow: "hidden" }}>
                            {row.phones.length ? (
                              row.phones.map((phone, index) => {
                                const phoneId = phone?.id || `${row.id}-phone-${index}`;
                                const draftValue = phoneDrafts[phoneId] ?? phone?.number ?? "";
                                const phoneDirty =
                                  normalizePhoneNumber(draftValue) !==
                                  normalizePhoneNumber(phoneDefaultsRef.current[phoneId] || "");
                                const isSavingPhone = savingPhoneIds.has(phoneId);
                                return (
                                  <Stack key={phoneId} spacing={0.5}>
                                    <PhoneNumberField
                                      value={draftValue}
                                      onChange={(value) =>
                                        setPhoneDrafts((prev) => ({ ...prev, [phoneId]: value }))
                                      }
                                      size="small"
                                      fullWidth
                                    />
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      startIcon={isSavingPhone ? <CircularProgress size={14} /> : <SaveIcon fontSize="small" />}
                                      disabled={!phoneDirty || isSavingPhone}
                                      onClick={() => handleSavePhone(row.id, phoneId)}
                                      sx={{ alignSelf: "flex-start", textTransform: "none" }}
                                    >
                                      Save phone
                                    </Button>
                                  </Stack>
                                );
                              })
                            ) : (
                              <Typography variant="caption" color="text.secondary">
                                --
                              </Typography>
                            )}
                          </Stack>
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="email"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="email" onOpenDetail={handleOpenDetail}>
                          {row.email ? (
                            <Link href={`mailto:${row.email}`}>{row.email}</Link>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              --
                            </Typography>
                          )}
                        </OverflowCell>
                      </SheetsCell>
                      <SheetsCell
                        columnKey="gogetta"
                        collapsedColumns={collapsedColumns}
                        columnOrder={COLUMN_ORDER}
                        tableContainerRef={tableContainerRef}
                        isMobile={isMobile}
                      >
                        <OverflowCell row={row} columnKey="gogetta" onOpenDetail={handleOpenDetail}>
                          <Tooltip title="Open in Gogetta" arrow>
                            <IconButton
                              size="small"
                              href={`https://gogetta.nyc/team/location/${row.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </OverflowCell>
                      </SheetsCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>
      <Box
        ref={bottomScrollbarRef}
        sx={{
          flexShrink: 0,
          overflowX: "auto",
          overflowY: "hidden",
          height: 14,
          borderTop: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.paper"
        }}
      >
        <Box sx={{ width: bottomScrollWidth, height: 1 }} />
      </Box>
      <Dialog open={detailModal.open} onClose={handleCloseDetail} maxWidth="lg" fullWidth>
        <DialogTitle>
          {detailModal.row?.locationName || detailModal.row?.organization || "Record details"}
        </DialogTitle>
        <DialogContent dividers sx={{ maxHeight: "70vh" }}>
          {detailModal.row ? (
            <Stack spacing={2}>
              {COLUMN_ORDER.map((key) => {
                const isFocused = detailModal.focusKey === key;
                return (
                  <Box
                    key={`detail-section-${key}`}
                    ref={(node) => {
                      if (node) detailSectionRefs.current.set(key, node);
                    }}
                    sx={{
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: isFocused ? "primary.main" : "divider",
                      backgroundColor: isFocused ? "action.hover" : "transparent",
                      px: 2,
                      py: 1.5
                    }}
                  >
                    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                      <Typography
                        variant="subtitle2"
                        sx={{ width: { md: 160 }, flexShrink: 0, color: "text.secondary" }}
                      >
                        {COLUMN_LABELS[key] || key}
                      </Typography>
                      <Box sx={{ flex: 1 }}>{renderDetailValue(detailModal.row, key)}</Box>
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No record selected.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetail}>Close</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={serviceModal.open} onClose={() => setServiceModal({ open: false, services: [], focusId: null, locationName: "" })} maxWidth="md" fullWidth>
        <DialogTitle>
          Services for {serviceModal.locationName || "location"}
        </DialogTitle>
        <DialogContent dividers sx={{ maxHeight: "70vh" }}>
          <Stack spacing={2}>
            {serviceModal.services.length ? (
              serviceModal.services.map((service, index) => (
                <Box
                  key={service?.id || `service-${index}`}
                  ref={(node) => {
                    if (node && service?.id) {
                      serviceRefs.current.set(service.id, node);
                    }
                  }}
                >
                  <Typography variant="h6">{service?.name || "Untitled service"}</Typography>
                  {service?.description && (
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {service.description}
                    </Typography>
                  )}
                  {service?.Taxonomies?.length ? (
                    <Typography variant="caption" color="text.secondary">
                      Taxonomies: {service.Taxonomies.map((tax) => tax?.name).filter(Boolean).join(", ")}
                    </Typography>
                  ) : null}
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No services found.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setServiceModal({ open: false, services: [], focusId: null, locationName: "" })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={noteModal.open} onClose={() => setNoteModal({ open: false, locationId: null, locationName: "", value: "" })} maxWidth="sm" fullWidth>
        <DialogTitle>Add note for {noteModal.locationName || "location"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              value={noteModal.value}
              onChange={(event) => setNoteModal((prev) => ({ ...prev, value: event.target.value }))}
              label="Note"
              multiline
              minRows={4}
              placeholder="Type note here"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setNoteModal({ open: false, locationId: null, locationName: "", value: "" })}
            startIcon={<CloseIcon fontSize="small" />}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitNote}
            disabled={noteSubmitting}
            startIcon={noteSubmitting ? <CircularProgress size={14} /> : <SaveIcon fontSize="small" />}
          >
            Save note
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};
export default withStreetlivesAuth(SheetsApp);
